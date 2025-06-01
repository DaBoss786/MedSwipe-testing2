// functions/index.js
// --- v2 Imports ---
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onRequest } = require("firebase-functions/v2/https"); // For webhook
const { logger } = require("firebase-functions"); // Use v1 logger for now, or switch to v2 logger if preferred
const admin = require("firebase-admin");
const stripe = require("stripe");
const { defineString } = require("firebase-functions/params");
const { PDFDocument, StandardFonts, rgb, degrees } = require("pdf-lib"); // Added degrees
const crypto = require("crypto");

// Initialize Firebase Admin SDK only once
if (admin.apps.length === 0) {
  admin.initializeApp();
  logger.info("Firebase Admin SDK initialized.");
} else {
  logger.info("Firebase Admin SDK already initialized.");
}

// Initialize Firestore DB INSTANCE - THIS IS CRITICAL
let db = admin.firestore(); // Changed to let to allow potential re-assignment for testing
logger.info("Firestore db object initialized in module scope. typeof db:", typeof db, "Is db truthy?", !!db);
if (!db || typeof db.collection !== 'function') {
    logger.error("CRITICAL FAILURE: admin.firestore() did not return a valid db instance at module scope! Re-initializing...");
    db = admin.firestore(); // Try re-initializing immediately
    logger.info("Attempted re-initialization. typeof db:", typeof db, "Is db truthy now?", !!db);
}

// --- Define Configuration Parameters (Keep as is) ---
// These define the secrets your functions need access to
//const stripeSecretKeyParam = defineString("STRIPE_SECRET_KEY"); // Simpler definition is fine
//const stripeWebhookSecretParam = defineString("STRIPE_WEBHOOK_SECRET");
// --- End Configuration Parameters ---


// --- Configuration for PDF Generation (Keep as is) ---
const BUCKET_NAME = "medswipe-648ee.firebasestorage.app";
const LOGO1_FILENAME_IN_BUCKET = "MedSwipe Logo gradient.png";
const LOGO2_FILENAME_IN_BUCKET = "CME consultants.jpg";
const storage = admin.storage();
const bucket = storage.bucket(BUCKET_NAME);
// --- End PDF Configuration ---

// --- Helper Function to Get Active CME Year ID ---
/**
 * Fetches all CME windows and determines which one is currently active.
 * @returns {Promise<string|null>} The document ID of the active CME window (e.g., "2025-2026"), or null if none is active.
 */
async function getActiveYearId() {
  // Ensure db is accessible here too
  if (!db) {
    logger.error("getActiveYearId: db is not defined!");
    throw new HttpsError("internal", "Database service unavailable in getActiveYearId.");
  }

  const now = admin.firestore.Timestamp.now();
  const cmeWindowsRef = admin.firestore().collection("cmeWindows");

  try {
    const snapshot = await cmeWindowsRef.get();
    if (snapshot.empty) {
      logger.warn("No CME windows defined in 'cmeWindows' collection.");
      return null;
    }

    for (const doc of snapshot.docs) {
      const windowData = doc.data();
      if (windowData.startDate && windowData.endDate) {
        // Ensure startDate and endDate are Firestore Timestamps
        const startDate = windowData.startDate instanceof admin.firestore.Timestamp
          ? windowData.startDate
          : admin.firestore.Timestamp.fromDate(new Date(windowData.startDate)); // Fallback if not already a Timestamp
        const endDate = windowData.endDate instanceof admin.firestore.Timestamp
          ? windowData.endDate
          : admin.firestore.Timestamp.fromDate(new Date(windowData.endDate)); // Fallback

        if (now.seconds >= startDate.seconds && now.seconds <= endDate.seconds) {
          logger.info(`Active CME window found: ${doc.id}`);
          return doc.id; // This is the yearId (e.g., "2025-2026")
        }
      } else {
        logger.warn(`CME window ${doc.id} is missing startDate or endDate.`);
      }
    }

    logger.info("No currently active CME window found for today's date.");
    return null;
  } catch (error) {
    logger.error("Error fetching active CME year ID:", error);
    throw new HttpsError("internal", "Could not determine active CME year."); // Or return null and handle in calling function
  }
}
// --- End Helper Function ---

// --------------------------------------------------------------------------
//  generateCmeCertificate  – landscape PDF with centred accreditation + border
// ---------------------------------------------------------------------------
exports.generateCmeCertificate = onCall(
  {
    secrets: [],
    timeoutSeconds: 120,
    memory: "512MiB",
  },
  async (request) => {
    /* ───────── 1. Auth check ───────── */
    if (!request.auth) throw new HttpsError("unauthenticated", "Please log in.");
    const uid = request.auth.uid;

    /* ───────── 2. Input validation ───────── */
    const { certificateFullName, creditsToClaim } = request.data;
    if (!certificateFullName?.trim())
      throw new HttpsError("invalid-argument", "Please provide a valid full name.");
    if (typeof creditsToClaim !== "number" || creditsToClaim <= 0 || isNaN(creditsToClaim))
      throw new HttpsError("invalid-argument", "Please provide a valid credits amount.");

    /* Round credits to nearest 0.25 */
    const rounded = Math.round(creditsToClaim * 4) / 4;
    let formattedCredits = rounded.toFixed(2);
    if (formattedCredits.endsWith("00") || formattedCredits.endsWith("50"))
      formattedCredits = rounded.toFixed(1);

    const claimDate = new Date().toLocaleDateString("en-US", {
      month: "long",
      day:   "numeric",
      year:  "numeric",
    });

    /* ───────── 3. Create PDF (landscape) & fonts ───────── */
    const pdfDoc = await PDFDocument.create();
    const page   = pdfDoc.addPage([792, 612]);               // 11×8.5 in landscape
    const { width, height } = page.getSize();

    const fontBold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontItalic  = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    /* ───────── 4. MedSwipe logo (smaller) ───────── */
    const CENTER_LOGO_FILENAME = "MedSwipe Logo gradient.png";             // adjust if different
    let centerLogoImg  = null;
    let centerLogoDims = { width: 0, height: 0 };
    try {
      const [bytes] = await bucket.file(CENTER_LOGO_FILENAME).download();
      centerLogoImg = CENTER_LOGO_FILENAME.toLowerCase().endsWith(".png")
        ? await pdfDoc.embedPng(bytes)
        : await pdfDoc.embedJpg(bytes);
      centerLogoDims = centerLogoImg.scale(45 / centerLogoImg.height); // ≈45 px tall
    } catch {
      logger.warn(`Logo ${CENTER_LOGO_FILENAME} not found – falling back to text.`);
    }

    /* ───────── 5. Helper drawing functions ───────── */
    const gray = rgb(0.15, 0.15, 0.15);

    const center = (txt, font, size, y, col = gray) => {
      const w = font.widthOfTextAtSize(txt, size);
      page.drawText(txt, { x: (width - w) / 2, y, size, font, color: col });
      return y - size - 6;
    };

    const centerMixed = (leftTxt, leftFont, rightTxt, rightFont, size, y) => {
      const leftW  = leftFont .widthOfTextAtSize(leftTxt , size);
      const rightW = rightFont.widthOfTextAtSize(rightTxt, size);
      const xStart = (width - (leftW + rightW)) / 2;
      page.drawText(leftTxt , { x: xStart       , y, size, font: leftFont , color: gray });
      page.drawText(rightTxt, { x: xStart+leftW , y, size, font: rightFont, color: gray });
      return y - size - 6;
    };

    /* ───────── 6. Draw decorative border ───────── */
    const borderM   = 24;                                   // margin
    page.drawRectangle({
      x: borderM,
      y: borderM,
      width:  width  - 2 * borderM,
      height: height - 2 * borderM,
      borderWidth: 2,
      borderColor: rgb(0.45, 0.45, 0.45),
    });

    /* ───────── 7. Draw certificate content ───────── */
    let y = height - 90;                                    // start near top

    y = center("CME Consultants", fontBold, 24, y);         // bigger
    y = center("in association with", fontRegular, 12, y);

    if (centerLogoImg) {
      page.drawImage(centerLogoImg, {
        x: (width - centerLogoDims.width) / 2,
        y: y - centerLogoDims.height,
        width:  centerLogoDims.width,
        height: centerLogoDims.height,
      });
      y -= centerLogoDims.height + 20;
    } else {
      y = center("MedSwipe", fontBold, 20, y);
      y -= 20;
    }

    y = center("Certifies that:", fontRegular, 14, y);
    y = center(certificateFullName, fontBold, 22, y, rgb(0, 0.3, 0.6));
    y = center("has participated in the enduring material titled", fontRegular, 12, y);
    y = center("“MedSwipe ENT CME Module”", fontBold, 14, y);
    y = center("on", fontRegular, 12, y);
    y = center(claimDate, fontRegular, 14, y);
    y = center("and is awarded", fontRegular, 12, y);

    y = centerMixed(`${formattedCredits} `, fontBold,
                    "AMA PRA Category 1 Credits™", fontItalic, 14, y);
    y -= 24;

    /* Accreditation statement – centred across the page */
    const accLines = [
      "This activity has been planned and implemented in accordance with the",
      "accreditation requirements and policies of the Accreditation Council for",
      "Continuing Medical Education (ACCME) through the joint providership of",
      "CME Consultants and MedSwipe. CME Consultants is accredited by the ACCME",
      "to provide continuing medical education for physicians.",
      "",
      "CME Consultants designates this enduring material for a maximum of",
      "24.0 AMA PRA Category 1 Credits™.",
      "",
      "Physicians should claim only the credit commensurate with the extent of",
      "their participation in the activity.",
    ];
    const accSize = 9;
    accLines.forEach((ln) => {
      if (ln.includes("AMA PRA Category 1 Credits™")) {
        const [pre] = ln.split("AMA PRA Category 1 Credits™");
        const fullW =
          fontRegular.widthOfTextAtSize(pre, accSize) +
          fontItalic .widthOfTextAtSize("AMA PRA Category 1 Credits™", accSize);
        const xStart = (width - fullW) / 2;
        page.drawText(pre, {
          x: xStart,
          y,
          size: accSize,
          font: fontRegular,
          color: gray,
        });
        page.drawText("AMA PRA Category 1 Credits™", {
          x: xStart + fontRegular.widthOfTextAtSize(pre, accSize),
          y,
          size: accSize,
          font: fontItalic,
          color: gray,
        });
      } else {
        const w = fontRegular.widthOfTextAtSize(ln, accSize);
        page.drawText(ln, {
          x: (width - w) / 2,
          y,
          size: accSize,
          font: ln.startsWith("CME Consultants designates") ? fontBold : fontRegular,
          color: gray,
        });
      }
      y -= accSize + 2;
    });

    /* ───────── 8. Save, upload, respond ───────── */
    const pdfBytes = await pdfDoc.save();
    const safeName = certificateFullName.replace(/[^a-zA-Z0-9]/g, "_");
    const path     = `cme_certificates/${uid}/${Date.now()}_${safeName}_CME.pdf`;
    await bucket.file(path).save(Buffer.from(pdfBytes), {
      metadata: { contentType: "application/pdf" },
      public: true,
    });

    return { success: true, publicUrl: bucket.file(path).publicUrl() };
  }
);



/*  ────────────────────────────────────────────────────────────────
    Stripe Webhook Handler – FULLY REPLACED
    Handles:
      • Board-Review subscription   (tier = "board_review")
      • CME-Annual  subscription    (tier = "cme_annual")
      • One-time CME-Credit bundle  (tier = "cme_credit")
    ──────────────────────────────────────────────────────────────── */
    exports.stripeWebhookHandler = onRequest(
      {
        region: "us-central1",
        timeoutSeconds: 180, // Increased timeout slightly for more complex logic
        memory: "256MiB",
        secrets: ["STRIPE_WEBHOOK_SECRET", "STRIPE_SECRET_KEY"],
      },
      async (req, res) => {
        const stripeSecret = process.env.STRIPE_SECRET_KEY;
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
        if (!stripeSecret || !webhookSecret) {
          logger.error("Stripe keys missing from environment for webhook.");
          return res.status(500).send("Server mis-configured (webhook keys).");
        }
        const stripeClient = stripe(stripeSecret); // stripeClient is initialized here
    
        if (req.method === "GET") return res.status(200).send("Webhook OK");
    
        let event;
        try {
          event = stripeClient.webhooks.constructEvent(
            req.rawBody,
            req.headers["stripe-signature"],
            webhookSecret
          );
        } catch (err) {
          logger.error("⚠️ Webhook signature verification failed:", err.message);
          return res.status(400).send(`Webhook Error: ${err.message}`);
        }
    
        const dataObject = event.data.object;
        logger.info(`Received Stripe event: ${event.type}, ID: ${event.id}`);
    
        // --- Helper function to determine accessTier based on user data ---
        const determineAccessTier = (userData) => {
          const tsMs = (ts) =>
            ts && typeof ts === "object" && typeof ts.toMillis === "function"
              ? ts.toMillis()
              : 0;

          const nowMs       = Date.now();
          const cmeEndMs    = tsMs(userData.cmeSubscriptionEndDate);
          const brEndMs     = tsMs(userData.boardReviewSubscriptionEndDate);
          const credits     = userData.cmeCreditsAvailable || 0;

          if (userData.cmeSubscriptionActive && cmeEndMs > nowMs) return "cme_annual";
          if (userData.boardReviewActive && brEndMs > nowMs)      return "board_review";
          if (credits > 0 && !(userData.cmeSubscriptionActive && cmeEndMs > nowMs))
              return "cme_credits_only";
          return "free_guest";
        };
    
        // --- Handle checkout.session.completed ---
        if (event.type === "checkout.session.completed") {
          const session = dataObject;
          const uid = session.client_reference_id;
          const tier = session.metadata?.tier || "unknown";
          const planName = session.metadata?.planName || "Subscription";
          const paid = session.payment_status === "paid";
          const custId = session.customer;
    
          logger.info(`➡️ checkout.session.completed: ${session.id} | tier=${tier} | mode=${session.mode} | uid=${uid} | paid=${paid}`);
    
          if (!uid || !paid) { // Note: For 100% off promo, 'paid' might still be true if an invoice is generated for $0.
                               // Or, if Stripe considers it a trial, payment_status might be 'no_payment_required'.
                               // The crucial part is that a subscription object is created.
                               // We will proceed if uid is present and session.mode is 'subscription' or 'payment'.
            if (!uid) {
                logger.warn("No uid in checkout.session.completed – aborting Firestore write.");
                return res.status(200).send("No-op (uid check)");
            }
            if (session.mode === "subscription" && !session.subscription) {
                logger.warn("Subscription mode but no subscription ID in checkout.session.completed - aborting.");
                return res.status(200).send("No-op (subscription ID check)");
            }
            // If it's a 100% off promo, 'paid' might not be 'paid' in the traditional sense,
            // but the session is still completed and a subscription is created.
            // We'll rely on the presence of session.subscription for subscriptions.
            logger.info(`Checkout session for UID ${uid} completed. Payment status: ${session.payment_status}. Mode: ${session.mode}.`);
          }
    
          const userRef = admin.firestore().collection("users").doc(uid);
          const updates = {
            stripeCustomerId: custId,
            isRegistered: true,
            lastStripeEvent: admin.firestore.Timestamp.now(),
            lastStripeEventType: event.type,
          };
    
          let newAccessTier = "free_guest";
    
          if (session.mode === "subscription") {
            const subId = session.subscription;
            if (!subId) {
              logger.error("No subscription ID on session for checkout.session.completed");
              return res.status(200).send("No subId in session");
            }
    
            let subscriptionFromStripe; // Renamed to avoid conflict with webhook 'subscription' variable
            try {
              // Retrieve the full subscription object to get all details, including discount/coupon
              subscriptionFromStripe = await stripeClient.subscriptions.retrieve(subId, { expand: ["items", "discount.coupon"] });
            } catch (err) {
              logger.error("Subscription fetch failed for checkout.session.completed:", err);
              return res.status(200).send("Sub fetch failed");
            }
    
            const item0 = subscriptionFromStripe.items?.data?.[0] || {};
            const startUnix = item0.current_period_start ?? subscriptionFromStripe.current_period_start;
            const endUnix = item0.current_period_end ?? subscriptionFromStripe.current_period_end;
            const startTS = startUnix ? admin.firestore.Timestamp.fromMillis(startUnix * 1000) : null;
            const endTS = endUnix ? admin.firestore.Timestamp.fromMillis(endUnix * 1000) : null;
    
            if (tier === "board_review") {
              Object.assign(updates, {
                boardReviewActive: true,
                boardReviewTier: planName,
                boardReviewSubscriptionId: subId,
                boardReviewSubscriptionStartDate: startTS ?? admin.firestore.FieldValue.serverTimestamp(),
                boardReviewSubscriptionEndDate: endTS,
              });
              newAccessTier = "board_review";
            } else if (tier === "cme_annual") {
              Object.assign(updates, {
                cmeSubscriptionActive: true,
                cmeSubscriptionPlan: planName,
                cmeSubscriptionId: subId,
                cmeSubscriptionStartDate: startTS ?? admin.firestore.FieldValue.serverTimestamp(),
                cmeSubscriptionEndDate: endTS,
                boardReviewActive: true, 
                boardReviewTier: "Granted by CME Annual",
                boardReviewSubscriptionId: subId,
                boardReviewSubscriptionStartDate: startTS ?? admin.firestore.FieldValue.serverTimestamp(),
                boardReviewSubscriptionEndDate: endTS,
              });
              newAccessTier = "cme_annual";
            } else {
              logger.warn(`Unhandled subscription tier "${tier}" in checkout.session.completed`);
            }

            // --- START: MODIFIED/NEW BLOCK for auto-canceling based on coupon metadata ---
            if (subscriptionFromStripe.discount && subscriptionFromStripe.discount.coupon && subscriptionFromStripe.discount.coupon.metadata) {
              if (subscriptionFromStripe.discount.coupon.metadata.auto_cancel_after_promo === 'true') {
                logger.info(`Subscription ${subId} used a coupon with auto_cancel_after_promo. Setting cancel_at_period_end=true.`);
                try {
                  await stripeClient.subscriptions.update(subId, {
                    cancel_at_period_end: true,
                  });
                  logger.info(`Subscription ${subId} successfully set to cancel at period end.`);
                  // The `customer.subscription.updated` webhook will fire due to this change,
                  // and your existing logic there should handle updating Firestore with `cancel_at_period_end`.
                  // We can also proactively add it to the 'updates' object for Firestore here if desired,
                  // though the subsequent webhook is the more canonical way Stripe handles this.
                  if (tier === "board_review") {
                    updates.boardReviewWillCancelAtPeriodEnd = true;
                  } else if (tier === "cme_annual") {
                    updates.cmeSubscriptionWillCancelAtPeriodEnd = true;
                  }

                } catch (err) {
                  logger.error(`Error setting cancel_at_period_end for subscription ${subId}:`, err);
                  // Continue with Firestore update even if this fails, but log the error.
                }
              }
            }
            // --- END: MODIFIED/NEW BLOCK ---

          } else if (session.mode === "payment") {
            if (tier === "cme_credits") {
              let credits = parseInt(session.metadata?.credits ?? "0", 10);
              if (!credits) {
                try {
                  const items = await stripeClient.checkout.sessions.listLineItems(session.id, { limit: 1 });
                  credits = items.data?.[0]?.quantity ?? 1;
                } catch (err) { credits = 1; }
              }
              Object.assign(updates, {
                cmeCreditsAvailable: admin.firestore.FieldValue.increment(credits),
                lastCmeCreditPurchaseDate: admin.firestore.Timestamp.now(),
              });
              try {
                const userDoc = await userRef.get();
                if (userDoc.exists()) {
                    const currentData = userDoc.data();
                    const tempUpdatedData = { ...currentData, ...updates, cmeCreditsAvailable: (currentData.cmeCreditsAvailable || 0) + credits };
                    newAccessTier = determineAccessTier(tempUpdatedData);
                } else {
                    newAccessTier = "cme_credits_only";
                }
              } catch (docError) {
                logger.error("Error fetching user doc for tier determination after credit purchase:", docError);
                newAccessTier = "cme_credits_only";
              }
            } else {
              logger.warn(`Unhandled payment tier "${tier}" in checkout.session.completed`);
            }
          } else {
            logger.warn(`Unhandled session mode "${session.mode}" in checkout.session.completed`);
          }
    
          updates.accessTier = newAccessTier;
    
          await userRef.set(updates, { merge: true });
          logger.info(`✅ Firestore updated for ${uid} from checkout.session.completed. New accessTier: ${newAccessTier}`);
          return res.status(200).send("OK (checkout.session.completed)");
        }
    
        // --- Handle customer.subscription.updated, customer.subscription.deleted ---
        if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
          const subscription = dataObject; // This is the Stripe subscription object from the event
          const customerId = subscription.customer;
          const status = subscription.status;
          const cancelAtPeriodEnd = subscription.cancel_at_period_end; // This is key!
      
          logger.info(`Subscription details: ID=${subscription.id}, Status=${status}, CancelAtPeriodEnd=${cancelAtPeriodEnd}, Start=${subscription.current_period_start}, End=${subscription.current_period_end}`);
      
          const usersQuery = admin.firestore().collection("users").where("stripeCustomerId", "==", customerId);
          const querySnapshot = await usersQuery.get();
    
          if (querySnapshot.empty) {
            logger.warn(`No user found with Stripe Customer ID: ${customerId} for event ${event.type}`);
            return res.status(200).send("No user for customer ID");
          }
    
          const userDoc = querySnapshot.docs[0];
          const uid = userDoc.id;
          const userRef = userDoc.ref;
          const userData = userDoc.data();
    
          const updates = {
            lastStripeEvent: admin.firestore.Timestamp.now(),
            lastStripeEventType: event.type,
          };
    
          // --- START: Determine tier based on subscription metadata or existing user data ---
          let tier = "unknown";
          let planName = "Subscription";

          // Attempt to get tier and planName from the subscription's metadata first
          if (subscription.metadata && subscription.metadata.tier) {
            tier = subscription.metadata.tier;
          } else if (subscription.items && subscription.items.data.length > 0 && subscription.items.data[0].price && subscription.items.data[0].price.metadata && subscription.items.data[0].price.metadata.tier) {
            tier = subscription.items.data[0].price.metadata.tier; // Check price metadata
          } else if (subscription.plan && subscription.plan.metadata && subscription.plan.metadata.tier) {
            tier = subscription.plan.metadata.tier; // Fallback to plan metadata (older Stripe versions)
          } else {
            // Fallback to user data if subscription metadata is missing tier
            if (userData.boardReviewSubscriptionId === subscription.id) {
                tier = "board_review";
            } else if (userData.cmeSubscriptionId === subscription.id) {
                tier = "cme_annual";
            }
          }

          if (subscription.metadata && subscription.metadata.planName) {
            planName = subscription.metadata.planName;
          } else if (subscription.items && subscription.items.data.length > 0 && subscription.items.data[0].price && subscription.items.data[0].price.nickname) {
            planName = subscription.items.data[0].price.nickname; // Use price nickname as planName
          } else if (userData.boardReviewSubscriptionId === subscription.id && userData.boardReviewTier) {
            planName = userData.boardReviewTier;
          } else if (userData.cmeSubscriptionId === subscription.id && userData.cmeSubscriptionPlan) {
            planName = userData.cmeSubscriptionPlan;
          }
          // --- END: Determine tier ---

          const isActiveStatus = status === "active" || status === "trialing";
          
          let startTS = null;
          let endTS   = null;
          const startSec = Number(subscription.current_period_start);
          if (Number.isFinite(startSec) && startSec > 0) {
            startTS = admin.firestore.Timestamp.fromMillis(startSec * 1000);
          }
          const endSec = Number(subscription.current_period_end);
          if (Number.isFinite(endSec) && endSec > 0) {
            endTS = admin.firestore.Timestamp.fromMillis(endSec * 1000);
          }

          if (tier === "board_review") {
            updates.boardReviewActive = isActiveStatus;
            updates.boardReviewTier = isActiveStatus ? planName : (cancelAtPeriodEnd ? `${planName} (Cancels ${endTS ? endTS.toDate().toLocaleDateString() : 'soon'})` : "Expired/Canceled");
            updates.boardReviewWillCancelAtPeriodEnd = cancelAtPeriodEnd; // Store this directly

            if (isActiveStatus) {
                updates.boardReviewSubscriptionStartDate = startTS || userData.boardReviewSubscriptionStartDate || admin.firestore.FieldValue.delete();
                updates.boardReviewSubscriptionEndDate = endTS || userData.boardReviewSubscriptionEndDate || admin.firestore.FieldValue.delete();
            } else if (!cancelAtPeriodEnd) { // If not active AND not set to cancel (i.e., truly expired/deleted)
                // Optionally clear dates or set specific "expired" values
                // updates.boardReviewSubscriptionEndDate = admin.firestore.FieldValue.delete(); // Or keep last known end date
            }
          } else if (tier === "cme_annual") {
            updates.cmeSubscriptionActive = isActiveStatus;
            updates.cmeSubscriptionPlan = isActiveStatus ? planName : (cancelAtPeriodEnd ? `${planName} (Cancels ${endTS ? endTS.toDate().toLocaleDateString() : 'soon'})` : "Expired/Canceled");
            updates.cmeSubscriptionWillCancelAtPeriodEnd = cancelAtPeriodEnd; // Store this directly

            if (isActiveStatus) {
              updates.cmeSubscriptionStartDate = startTS || userData.cmeSubscriptionStartDate || admin.firestore.FieldValue.delete();
              updates.cmeSubscriptionEndDate = endTS || userData.cmeSubscriptionEndDate || admin.firestore.FieldValue.delete();
            }

            // CME Annual also affects Board Review status
            updates.boardReviewActive = isActiveStatus; // If CME annual is active, BR is active
            updates.boardReviewTier = isActiveStatus
                ? "Granted by CME Annual"
                : (cancelAtPeriodEnd && userData.cmeSubscriptionId === subscription.id ? `Granted by CME Annual (Cancels ${endTS ? endTS.toDate().toLocaleDateString() : 'soon'})` : "Expired/Canceled");
            updates.boardReviewWillCancelAtPeriodEnd = (userData.cmeSubscriptionId === subscription.id) ? cancelAtPeriodEnd : userData.boardReviewWillCancelAtPeriodEnd;


            if (isActiveStatus) {
                if (startTS) updates.boardReviewSubscriptionStartDate = startTS;
                if (endTS) updates.boardReviewSubscriptionEndDate = endTS;
            }
        } else {
            logger.warn(`Unhandled subscription tier "${tier}" in ${event.type} for subscription ID ${subscription.id}`);
        }

        const potentiallyUpdatedUserData = { ...userData, ...updates };
        updates.accessTier = determineAccessTier(potentiallyUpdatedUserData);

        await userRef.set(updates, { merge: true });

        logger.info(`Firestore updated for ${uid} from ${event.type}. New accessTier: ${updates.accessTier}. CancelAtPeriodEnd: ${cancelAtPeriodEnd}`);
        return res.status(200).send(`OK (${event.type})`);
    }
        
        // --- Handle invoice.payment_failed ---
        if (event.type === 'invoice.payment_failed') {
            const invoice = dataObject;
            const customerId = invoice.customer;
            const subscriptionId = invoice.subscription; 
    
            logger.info(`➡️ Invoice payment failed for Sub ID: ${subscriptionId}, Cust ID: ${customerId}`);
    
            if (!customerId || !subscriptionId) {
                logger.warn("Invoice.payment_failed: Missing customer or subscription ID.");
                return res.status(200).send("Missing info for payment_failed");
            }
    
            const usersQuery = admin.firestore().collection("users").where("stripeCustomerId", "==", customerId);
            const querySnapshot = await usersQuery.get();
    
            if (querySnapshot.empty) {
                logger.warn(`No user found with Stripe Customer ID: ${customerId} for invoice.payment_failed`);
                return res.status(200).send("No user for customer ID (payment_failed)");
            }
            
            const userDoc = querySnapshot.docs[0];
            const uid = userDoc.id;
            const userRef = userDoc.ref;
            const userData = userDoc.data();
            
            const updates = {
                lastStripeEvent: admin.firestore.Timestamp.now(),
                lastStripeEventType: event.type,
            };
    
            if (userData.boardReviewSubscriptionId === subscriptionId) {
                updates.boardReviewActive = false;
                updates.boardReviewTier = "Payment Failed";
                updates.boardReviewWillCancelAtPeriodEnd = false; // Payment failed, so it's not "canceling at period end" anymore, it's just inactive.
                logger.info(`Marking Board Review inactive for user ${uid} due to payment failure.`);
            }
            if (userData.cmeSubscriptionId === subscriptionId) {
                updates.cmeSubscriptionActive = false;
                updates.cmeSubscriptionPlan = "Payment Failed";
                updates.cmeSubscriptionWillCancelAtPeriodEnd = false;
                updates.boardReviewActive = false; 
                updates.boardReviewTier = "Payment Failed (CME Annual)";
                updates.boardReviewWillCancelAtPeriodEnd = false;
                logger.info(`Marking CME Annual (and associated Board Review) inactive for user ${uid} due to payment failure.`);
            }
    
            const potentiallyUpdatedUserData = { ...userData, ...updates };
            updates.accessTier = determineAccessTier(potentiallyUpdatedUserData);
    
            await userRef.set(updates, { merge: true });
            logger.info(`✅ Firestore updated for ${uid} from invoice.payment_failed. New accessTier: ${updates.accessTier}`);
            return res.status(200).send("OK (invoice.payment_failed)");
        }
    
    
        logger.info(`Webhook event ${event.type} (ID: ${event.id}) not explicitly handled or no action taken.`);
        return res.status(200).send("OK (event not handled)");
      }
    );
    // --- END OF REPLACEMENT for stripeWebhookHandler ---
    
    
    
    /*  ────────────────────────────────────────────────────────────────
        createStripeCheckoutSession – FULLY REPLACED
        Builds sessions for:
          • Board-Review subscription
          • CME-Annual  subscription
          • CME-Credit  one-time bundle (quantity ≥1)
        ──────────────────────────────────────────────────────────────── */
    exports.createStripeCheckoutSession = onCall(
      {
        region: "us-central1",
        memory: "256MiB",
        secrets: ["STRIPE_SECRET_KEY"],
      },
      async (req) => {
        if (!req.auth) {
          throw new HttpsError("unauthenticated", "Login required.");
        }
        const uid        = req.auth.uid;
        const priceId    = req.data.priceId;        // required
        const planName   = req.data.planName || "Subscription";
        const tier       = req.data.tier;           // required on client
        let   quantity   = req.data.quantity || 1;  // only for credits
    
        if (!priceId || typeof priceId !== "string")
          throw new HttpsError("invalid-argument", "priceId missing.");
    
        if (!tier || typeof tier !== "string")
          throw new HttpsError("invalid-argument", "tier missing.");
    
        /* Detect mode – anything with tier === cme_credit → payment */
        const creditPriceId = "price_1RKXlYR9wwfN8hwyGznI4iXS"; // <-- your one-time price
        const mode = tier === "cme_credits" || priceId === creditPriceId
          ? "payment"
          : "subscription";
    
        /* subscriptions always quantity 1 */
        if (mode === "subscription") quantity = 1;
    
        const stripeClient = stripe(process.env.STRIPE_SECRET_KEY);
        const APP_URL      = "https://daboss786.github.io/MedSwipe-testing2";
    
        const params = {
          mode,
          payment_method_types: ["card"],
          client_reference_id: uid,
          line_items: [{ price: priceId, quantity }],
          success_url: `${APP_URL}/checkout-success.html`,
          cancel_url : `${APP_URL}/checkout-cancel.html?tier=${encodeURIComponent(tier)}`,
          metadata: {
            planName,
            tier,
            ...(mode === "payment" ? { credits: String(quantity) } : {}),
          },
          allow_promotion_codes: true,
        };
    
        if (mode === "subscription") {
          params.subscription_data = {
            metadata: { planName, tier },
          };
        }
    
        const session = await stripeClient.checkout.sessions.create(params);
        logger.info(`🟢 session ${session.id} | mode=${mode} | tier=${tier}`);
        return { sessionId: session.id };
      }
    );
    


// --- Callable Function to Create Stripe Customer Portal Session ---
exports.createStripePortalSession = onCall(
  {
    region: "us-central1", // Or your preferred region
    memory: "256MiB",
    secrets: ["STRIPE_SECRET_KEY"] // Needs the secret key
  },
  async (request) => {
    logger.log("createStripePortalSession called.");

    // 1. Auth check
    if (!request.auth) {
      logger.error("Portal Session: Authentication failed.");
      throw new HttpsError("unauthenticated", "You must be logged in.");
    }
    const uid = request.auth.uid;
    logger.log(`Portal Session: Authenticated user: ${uid}`);

    // 2. Initialize Stripe Client
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      logger.error("CRITICAL: Portal Session: Stripe secret key missing.");
      throw new HttpsError("internal", "Server config error [SK].");
    }
    const stripeClient = stripe(secretKey);
    logger.info("Portal Session: Stripe client initialized.");

    // 3. Get Stripe Customer ID from Firestore
    let stripeCustomerId;
    try {
      const userDocRef = admin.firestore().collection('users').doc(uid);
      const userDocSnap = await userDocRef.get();

      if (!userDocSnap.exists) {
        logger.error(`Portal Session: User document not found for UID: ${uid}`);
        throw new HttpsError("not-found", "User data not found.");
      }
      stripeCustomerId = userDocSnap.data()?.stripeCustomerId; // Get the stored ID

      if (!stripeCustomerId) {
        logger.error(`Portal Session: Stripe Customer ID not found in Firestore for UID: ${uid}`);
        throw new HttpsError("failed-precondition", "Subscription not found for this user.");
      }
       logger.log(`Portal Session: Found Stripe Customer ID: ${stripeCustomerId} for UID: ${uid}`);

    } catch (dbError) {
      logger.error(`Portal Session: Firestore lookup failed for UID ${uid}:`, dbError);
      throw new HttpsError("internal", "Failed to retrieve user data.");
    }

    // 4. Define Return URL (Where user comes back *after* portal)
    const YOUR_APP_BASE_URL = "https://daboss786.github.io/MedSwipe-testing"; // <<< Double-check this URL
    const returnUrl = `${YOUR_APP_BASE_URL}/`; // Return to dashboard/homepage

    // 5. Create the Stripe Billing Portal Session
    try {
      const portalSession = await stripeClient.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: returnUrl,
      });

      logger.log(`Portal Session: Created Stripe Portal Session ${portalSession.id} for Customer ${stripeCustomerId}`);
      // 6. Return the Portal Session URL to the client
      return { portalUrl: portalSession.url };

    } catch (error) {
      logger.error(`Portal Session: Error creating Stripe Portal Session for Customer ${stripeCustomerId}:`, error);
      throw new HttpsError("internal", `Failed to create portal session: ${error.message}`);
    }
  }
); // End createStripePortalSession

// --- Callable Function to Record CME Answer and Award Credits Annually ---
// --- Define Configuration Parameters (Keep as is from your file) ---
const ACCURACY_THRESHOLD = 0.70;  // 70 % required for credit
const MINUTES_PER_QUESTION = 4.8;   // avg time per Q
const MINUTES_PER_QUARTER_CREDIT = 15;    // 0.25 credit ÷ 15 min
const MAX_CME_CREDITS_PER_YEAR = 24;    // annual cap (renamed from MAX_CME_CREDITS for clarity with your existing constant)
// --- End Configuration Parameters ---

exports.recordCmeAnswerV2 = onCall(
  {
    region: "us-central1", // Or your preferred region
    memory: "512MiB",
    timeoutSeconds: 60,
  },
  async (event) => { // 'event' contains 'auth' and 'data'

    /* 1. Authentication check */
    if (!event.auth) {
      logger.error("recordCmeAnswerV2: Authentication failed. No auth context.");
      throw new HttpsError("unauthenticated", "Please log in first.");
    }
    const uid = event.auth.uid;
    logger.info(`recordCmeAnswerV2: Called by authenticated user: ${uid}`);

    /* 2. Validate payload */
    const { questionId, category, isCorrect /*, timeSpent is not used in this version but could be added */ } = event.data;
    if (!questionId || typeof questionId !== "string" || questionId.trim() === "") {
      logger.error("recordCmeAnswerV2: Validation failed. Invalid questionId.", { data: event.data });
      throw new HttpsError("invalid-argument", "A valid question ID (questionId) is required.");
    }
    if (!category || typeof category !== "string" || category.trim() === "") {
      logger.error("recordCmeAnswerV2: Validation failed. Invalid category.", { data: event.data });
      throw new HttpsError("invalid-argument", "A valid category is required.");
    }
    if (typeof isCorrect !== "boolean") {
      logger.error("recordCmeAnswerV2: Validation failed. Invalid isCorrect flag.", { data: event.data });
      throw new HttpsError("invalid-argument", "A boolean 'isCorrect' flag is required.");
    }
    logger.info(`recordCmeAnswerV2: Processing for QID (text): "${questionId.substring(0, 50)}...", Correct: ${isCorrect}`);


    /* 3. Resolve current CME-year */
    const activeYearId = await getActiveYearId(); // Uses your existing async function
    if (!activeYearId) {
      logger.warn(`recordCmeAnswerV2: No active CME year found. Cannot record answer for user ${uid}.`);
      // Match the return structure of successful calls for consistency if client expects it
      return {
        status: "no_active_year",
        message: "No active CME accreditation year. Credits cannot be awarded at this time.",
        creditedThisAnswer: 0,
        newYearTotalCredits: 0,
        totalAnsweredInYear: 0,
        activeYearId: null
      };
      // Or throw: throw new HttpsError("failed-precondition", "No active CME year could be determined.");
    }
    logger.info(`recordCmeAnswerV2: Active CME Year ID: ${activeYearId} for user ${uid}.`);

    // 3.5 Check User's Access Tier (copied from your existing function)
    const userDocRefForTierCheck = db.collection("users").doc(uid); // db is your global Firestore instance
    const userDocSnapForTierCheck = await userDocRefForTierCheck.get();
    if (!userDocSnapForTierCheck.exists) {
        logger.error(`recordCmeAnswerV2: User document not found for UID: ${uid}.`);
        throw new HttpsError("not-found", "User data not found. Cannot process CME answer.");
    }
    const userDataForTierCheck = userDocSnapForTierCheck.data();
    const accessTier = userDataForTierCheck.accessTier;
    if (accessTier !== "cme_annual" && accessTier !== "cme_credits_only") {
        logger.info(`recordCmeAnswerV2: User ${uid} has accessTier '${accessTier}', not eligible for CME credits for QID "${questionId.substring(0,50)}...".`);
        return {
            status: "tier_ineligible",
            message: "Your current subscription tier is not eligible for CME credits.",
            creditedThisAnswer: 0,
            newYearTotalCredits: 0,
            totalAnsweredInYear: 0,
            activeYearId: activeYearId
        };
    }
    logger.info(`recordCmeAnswerV2: User ${uid} has eligible tier '${accessTier}'.`);


    /* 4. Build doc refs */
    const questionHash = crypto.createHash("sha256").update(questionId).digest("hex");
    const answerDocId  = `${activeYearId}_${questionHash}`;

    const answerRef    = db.collection("users").doc(uid)
                           .collection("cmeAnswers").doc(answerDocId);
    const yearStatsRef = db.collection("users").doc(uid)
                           .collection("cmeStats").doc(activeYearId);
    const userRef      = db.collection("users").doc(uid); // This is userDocRefForTierCheck

    /* 5. Single Firestore transaction */
    const result = await db.runTransaction(async (tx) => {

      /* 5a. Pull docs */
      // userSnap is already fetched as userDocSnapForTierCheck, but for transaction consistency, get it again or pass its data.
      // For simplicity in adapting, let's re-fetch within transaction.
      const [answerSnap, yearSnap, userSnapTx] = await Promise.all([
        tx.get(answerRef),
        tx.get(yearStatsRef),
        tx.get(userRef) // Fetch user doc again inside transaction
      ]);

      /* Ensure aggregate objects exist */
      let userData = userSnapTx.exists ? userSnapTx.data() : {}; // Use the transaction-fetched user data
      if (!userData.cmeStats) {
        userData.cmeStats = { totalAnswered: 0, totalCorrect: 0, creditsEarned: 0.00, creditsClaimed: 0.00 };
      } else { // Ensure all sub-fields exist
        userData.cmeStats.totalAnswered = userData.cmeStats.totalAnswered || 0;
        userData.cmeStats.totalCorrect = userData.cmeStats.totalCorrect || 0;
        userData.cmeStats.creditsEarned = userData.cmeStats.creditsEarned || 0.00;
        userData.cmeStats.creditsClaimed = userData.cmeStats.creditsClaimed || 0.00;
      }


      let yearData = yearSnap.exists
        ? { totalAnsweredInYear: 0, totalCorrectInYear: 0, creditsEarned: 0.00, ...yearSnap.data() }
        : { totalAnsweredInYear: 0, totalCorrectInYear: 0, creditsEarned: 0.00 };
      // Ensure creditsEarned is a number for calculations
      yearData.creditsEarned = parseFloat(yearData.creditsEarned || 0);


      /* 5b. Handle scenarios */
      let messageForLog = "";
      if (!answerSnap.exists) {                                      // ❶ First attempt
        messageForLog = "First attempt";
        tx.set(answerRef, {
          originalQuestionId: questionId, // Store the full text
          answeredAt: admin.firestore.FieldValue.serverTimestamp(),
          isCorrect,
          category
        });

        yearData.totalAnsweredInYear += 1;
        if (isCorrect) yearData.totalCorrectInYear += 1;

        userData.cmeStats.totalAnswered += 1;
        if (isCorrect) userData.cmeStats.totalCorrect += 1;

      } else if (answerSnap.data().isCorrect === true) {             // ❷ Already correct
        logger.info(`recordCmeAnswerV2: Question (hash: ${questionHash}) already correctly recorded for user ${uid} in year ${activeYearId}.`);
        return {
          status:               "already_correct", // More specific status
          message:              "You already earned credit for this question this year.",
          creditedThisAnswer:   0,
          newYearTotalCredits:  yearData.creditsEarned,
          totalAnsweredInYear:  yearData.totalAnsweredInYear,
          activeYearId,
          // For client-side UI updates, mirror structure of your old function if needed
          overallCreditsEarned: parseFloat(userData.cmeStats.creditsEarned.toFixed(2)),
          overallTotalAnswered: userData.cmeStats.totalAnswered,
          overallTotalCorrect:  userData.cmeStats.totalCorrect,
        };

      } else if (answerSnap.data().isCorrect === false && isCorrect) { // ❸ Fix a miss
        messageForLog = "Fixing a miss";
        tx.update(answerRef, {
          isCorrect:  true,
          correctedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        yearData.totalCorrectInYear += 1; // Only increment correct, not answered again
        userData.cmeStats.totalCorrect += 1; // Overall correct count up

      } else { // isCorrect is false, and previous answer was also false (or some other edge case)
        messageForLog = "Repeat incorrect or no change";
         logger.info(`recordCmeAnswerV2: Question (hash: ${questionHash}) previously incorrect, and still incorrect for user ${uid} in year ${activeYearId}.`);
        // Optionally, update a 'lastAttemptAt' timestamp on answerRef if desired
        // tx.update(answerRef, { lastAttemptAt: admin.firestore.FieldValue.serverTimestamp() });
        return {
          status:               "still_incorrect", // More specific
          message:              "Answer recorded. Accuracy for this question this year remains unchanged.",
          creditedThisAnswer:   0,
          newYearTotalCredits:  yearData.creditsEarned,
          totalAnsweredInYear:  yearData.totalAnsweredInYear,
          activeYearId,
          overallCreditsEarned: parseFloat(userData.cmeStats.creditsEarned.toFixed(2)),
          overallTotalAnswered: userData.cmeStats.totalAnswered,
          overallTotalCorrect:  userData.cmeStats.totalCorrect,
        };
      }
      logger.info(`recordCmeAnswerV2: Scenario for ${uid}, year ${activeYearId}, QID_hash ${questionHash}: ${messageForLog}`);

      /* 5c. Recalculate credits */
      const accuracy  = yearData.totalAnsweredInYear > 0
        ? yearData.totalCorrectInYear / yearData.totalAnsweredInYear
        : 0;

      let prevCreditsInYear = yearData.creditsEarned; // This is already a float from init
      let newCreditsInYear  = prevCreditsInYear;

      if (accuracy >= ACCURACY_THRESHOLD) {
        const minutes       = yearData.totalAnsweredInYear * MINUTES_PER_QUESTION;
        const quarterCreds  = Math.round(minutes / MINUTES_PER_QUARTER_CREDIT); // Rounds to nearest 0.25
        newCreditsInYear    = Math.min(quarterCreds * 0.25, MAX_CME_CREDITS_PER_YEAR);
      }

      // Ensure calculations are with floats and then toFixed for storage/comparison
      const creditedThisAnswerDelta = parseFloat((newCreditsInYear - prevCreditsInYear).toFixed(2));
      yearData.creditsEarned   = parseFloat(newCreditsInYear.toFixed(2));


      /* 5d. Persist aggregates */
      yearData.lastUpdated = admin.firestore.FieldValue.serverTimestamp();
      tx.set(yearStatsRef, yearData, { merge: true }); // yearData contains all necessary fields

      // Update overall (lifetime) creditsEarned
      // Ensure userData.cmeStats.creditsEarned is a number
      const currentOverallCreditsEarned = parseFloat(userData.cmeStats.creditsEarned || 0);
      userData.cmeStats.creditsEarned = parseFloat(
        (currentOverallCreditsEarned + creditedThisAnswerDelta).toFixed(2)
      );
      tx.set(userRef, { cmeStats: userData.cmeStats }, { merge: true }); // Only merge cmeStats field

      /* 5e. Return */
      let finalStatus = "no_change";
      let finalMessage = "Answer recorded. No change in credits earned this answer.";

      if (creditedThisAnswerDelta > 0) {
          finalStatus = "success";
          finalMessage = `Answer recorded. ${creditedThisAnswerDelta.toFixed(2)} credits earned this answer for year ${activeYearId}.`;
      } else if (yearData.creditsEarned >= MAX_CME_CREDITS_PER_YEAR) {
          finalStatus = "limit_reached";
          finalMessage = `Answer recorded. Yearly credit limit for ${activeYearId} reached.`;
      } else if (accuracy < ACCURACY_THRESHOLD && yearData.totalAnsweredInYear > 0) {
          finalStatus = "accuracy_low";
          finalMessage = `Answer recorded. Yearly accuracy for ${activeYearId} (${(accuracy*100).toFixed(0)}%) below threshold for new credits.`;
      }


      logger.info(`recordCmeAnswerV2: Transaction for user ${uid}, year ${activeYearId}, QID_hash: ${questionHash} successful. Credits this answer (year): ${creditedThisAnswerDelta.toFixed(2)}, New total for year: ${yearData.creditsEarned.toFixed(2)}, Total answered in year: ${yearData.totalAnsweredInYear}, New OVERALL earned: ${userData.cmeStats.creditsEarned.toFixed(2)}, Overall answered: ${userData.cmeStats.totalAnswered}`);

      return {
        status: finalStatus,
        message: finalMessage,
        creditedThisAnswer: creditedThisAnswerDelta, // The actual change from this event
        newYearTotalCredits: yearData.creditsEarned, // Total for the year after this event
        totalAnsweredInYear: yearData.totalAnsweredInYear,
        activeYearId,
        // Add overall stats for client convenience, similar to your old function
        overallCreditsEarned: userData.cmeStats.creditsEarned,
        overallTotalAnswered: userData.cmeStats.totalAnswered,
        overallTotalCorrect:  userData.cmeStats.totalCorrect,
      };
    }); // end transaction

    logger.info(`recordCmeAnswerV2 Final Result for ${uid} → Status: ${result.status}, Message: ${result.message}`);
    return result;
  }
);
// --- End Callable Function recordCmeAnswerV2 ---

// --- MODIFIED LEADERBOARD CLOUD FUNCTION ---
exports.getLeaderboardData = onCall(
  {
    region: "us-central1",
    memory: "512MiB",
    timeoutSeconds: 60,
  },
  async (request) => {
    logger.info("getLeaderboardData function called", { authUid: request.auth?.uid });
    
    // AGGRESSIVE CHECK AND POTENTIAL RE-INITIALIZATION
    let currentDbInstance = db; // Try to use the global one
    logger.info("Inside getLeaderboardData. typeof global db:", typeof currentDbInstance, "Is global db truthy?", !!currentDbInstance);

    if (!currentDbInstance || typeof currentDbInstance.collection !== 'function') {
        logger.warn("Global 'db' is not valid inside getLeaderboardData. Attempting to re-initialize locally for this call.");
        currentDbInstance = admin.firestore();
        logger.info("Locally re-initialized db. typeof currentDbInstance:", typeof currentDbInstance, "Is it truthy?", !!currentDbInstance);
        if (!currentDbInstance || typeof currentDbInstance.collection !== 'function') {
            logger.error("CRITICAL: Failed to get a valid Firestore instance even with local re-initialization in getLeaderboardData!");
            throw new HttpsError("internal", "Database service is critically unavailable.");
        }
    }

    // 1. Authentication Check
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "The function must be called while authenticated."
      );
    }
    const currentAuthUid = request.auth.uid;

    function getStartOfWeekMilliseconds(date = new Date()) {
      const d = new Date(date);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const startOfWeekDate = new Date(d.setDate(diff));
      startOfWeekDate.setHours(0, 0, 0, 0);
      return startOfWeekDate.getTime();
    }

    const TOP_N_LEADERBOARD = 10;

    try {
      // Use currentDbInstance which is either the global 'db' or the locally re-initialized one
      logger.info("Attempting to query users collection with currentDbInstance:", typeof currentDbInstance);
      const usersSnapshot = await currentDbInstance.collection("users").get();
      logger.info("Users collection query successful. Number of docs:", usersSnapshot.size);
      
      const allEligibleUsersData = [];
      const weekStartMillis = getStartOfWeekMilliseconds();

      usersSnapshot.forEach((doc) => {
        const userData = doc.data();
        if (userData.isRegistered === true) {
          let weeklyAnsweredCount = 0;
          if (userData.answeredQuestions) {
            for (const questionKey in userData.answeredQuestions) {
              const answer = userData.answeredQuestions[questionKey];
              if (answer.timestamp && answer.timestamp >= weekStartMillis) {
                weeklyAnsweredCount++;
              }
            }
          }
          allEligibleUsersData.push({
            uid: doc.id,
            username: userData.username || "Anonymous",
            xp: userData.stats?.xp || 0,
            level: userData.stats?.level || 1,
            currentStreak: userData.streaks?.currentStreak || 0,
            weeklyAnsweredCount: weeklyAnsweredCount,
          });
        }
      });

      logger.info(`Processed ${allEligibleUsersData.length} eligible users for leaderboards.`);
      let currentUserRanks = { xp: null, streak: null, answered: null };

      const sortedByXp = [...allEligibleUsersData].sort((a, b) => b.xp - a.xp);
      const xpLeaderboard = sortedByXp
        .slice(0, TOP_N_LEADERBOARD)
        .map((user, index) => ({ ...user, rank: index + 1 })); // Spread user to include all its props
      const currentUserXpIndex = sortedByXp.findIndex(u => u.uid === currentAuthUid);
      if (currentUserXpIndex !== -1) {
        currentUserRanks.xp = { ...sortedByXp[currentUserXpIndex], rank: currentUserXpIndex + 1 };
      }

      const sortedByStreak = [...allEligibleUsersData].sort((a, b) => b.currentStreak - a.currentStreak);
      const streakLeaderboard = sortedByStreak
        .slice(0, TOP_N_LEADERBOARD)
        .map((user, index) => ({ ...user, rank: index + 1 }));
      const currentUserStreakIndex = sortedByStreak.findIndex(u => u.uid === currentAuthUid);
      if (currentUserStreakIndex !== -1) {
        currentUserRanks.streak = { ...sortedByStreak[currentUserStreakIndex], rank: currentUserStreakIndex + 1 };
      }

      const sortedByAnswered = [...allEligibleUsersData].sort((a, b) => b.weeklyAnsweredCount - a.weeklyAnsweredCount);
      const answeredLeaderboard = sortedByAnswered
        .slice(0, TOP_N_LEADERBOARD)
        .map((user, index) => ({ ...user, rank: index + 1 }));
      const currentUserAnsweredIndex = sortedByAnswered.findIndex(u => u.uid === currentAuthUid);
      if (currentUserAnsweredIndex !== -1) {
        currentUserRanks.answered = { ...sortedByAnswered[currentUserAnsweredIndex], rank: currentUserAnsweredIndex + 1 };
      }

      logger.info("Leaderboard data prepared successfully.");
      return {
        xpLeaderboard,
        streakLeaderboard,
        answeredLeaderboard,
        currentUserRanks,
      };

    } catch (error) {
      logger.error("Error during leaderboard data processing in getLeaderboardData:", error, {stack: error.stack});
      throw new HttpsError(
        "internal",
        "An error occurred while processing leaderboard data.",
        error.message
      );
    }
  }
);
// --- END LEADERBOARD CLOUD FUNCTION ---