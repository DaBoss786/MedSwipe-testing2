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

// --- Initialize Firebase Admin SDK (Keep as is) ---
// Initialize Firebase Admin SDK only once
if (admin.apps.length === 0) {
  admin.initializeApp();
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


// --- generateCmeCertificate Function (Keep As Is - No Changes) ---
exports.generateCmeCertificate = onCall({
    secrets: [], // Add secrets if this function needs any in the future
    timeoutSeconds: 120,
    memory: "512MiB"
    }, async (request) => {
  // 1. Auth check
  if (!request.auth) {
    logger.error("Authentication failed: No auth context.");
    throw new HttpsError("unauthenticated", "Please log in.");
  }
  const uid = request.auth.uid;
  logger.log(`Function called by authenticated user: ${uid}`);

  // 2. Input validation
  const { certificateFullName, creditsToClaim } = request.data;
  if (
    !certificateFullName ||
    typeof certificateFullName !== "string" ||
    certificateFullName.trim() === ""
  ) {
    logger.error("Validation failed: Invalid certificateFullName.", { data: request.data });
    throw new HttpsError("invalid-argument", "Please provide a valid full name.");
  }
  if (
    typeof creditsToClaim !== "number" ||
    creditsToClaim <= 0 ||
    isNaN(creditsToClaim)
  ) {
    logger.error("Validation failed: Invalid creditsToClaim.", { data: request.data });
    throw new HttpsError("invalid-argument", "Please provide a valid credits amount.");
  }
  const formattedCredits = creditsToClaim.toFixed(2); // Format credits to 2 decimal places
  const claimDate = new Date().toLocaleDateString(); // Generate date string

  logger.log(`Generating certificate for: ${certificateFullName}, Credits: ${formattedCredits}, Date: ${claimDate}`);

  try {
    // 3. Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // US Letter size (width, height)
    const { width, height } = page.getSize();

    // 4. Embed fonts
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    // 5. Load and embed Logos from Cloud Storage
    let logo1Image, logo2Image;
    let logo1Dims = { width: 0, height: 0 };
    let logo2Dims = { width: 0, height: 0 };
    const desiredLogoHeight = 50;

    try {
      logger.log(`Attempting to download logo 1: ${LOGO1_FILENAME_IN_BUCKET}`);
      const logo1File = bucket.file(LOGO1_FILENAME_IN_BUCKET);
      const [logo1Data] = await logo1File.download();
      if (LOGO1_FILENAME_IN_BUCKET.toLowerCase().endsWith(".png")) {
         logo1Image = await pdfDoc.embedPng(logo1Data);
      } else if (LOGO1_FILENAME_IN_BUCKET.toLowerCase().endsWith(".jpg") || LOGO1_FILENAME_IN_BUCKET.toLowerCase().endsWith(".jpeg")) {
         logo1Image = await pdfDoc.embedJpg(logo1Data);
      } else {
         throw new Error(`Unsupported file type for logo 1: ${LOGO1_FILENAME_IN_BUCKET}`);
      }
      logo1Dims = logo1Image.scale(desiredLogoHeight / logo1Image.height);
      logger.log(`Logo 1 (${LOGO1_FILENAME_IN_BUCKET}) embedded successfully.`);
    } catch (error) {
      logger.error(`Failed to load or embed logo 1 (${LOGO1_FILENAME_IN_BUCKET}):`, error);
    }

    if (LOGO2_FILENAME_IN_BUCKET) {
        try {
            logger.log(`Attempting to download logo 2: ${LOGO2_FILENAME_IN_BUCKET}`);
            const logo2File = bucket.file(LOGO2_FILENAME_IN_BUCKET);
            const [logo2Data] = await logo2File.download();
            if (LOGO2_FILENAME_IN_BUCKET.toLowerCase().endsWith(".png")) {
                logo2Image = await pdfDoc.embedPng(logo2Data);
            } else if (LOGO2_FILENAME_IN_BUCKET.toLowerCase().endsWith(".jpg") || LOGO2_FILENAME_IN_BUCKET.toLowerCase().endsWith(".jpeg")) {
                logo2Image = await pdfDoc.embedJpg(logo2Data);
            } else {
                throw new Error(`Unsupported file type for logo 2: ${LOGO2_FILENAME_IN_BUCKET}`);
            }
            logo2Dims = logo2Image.scale(desiredLogoHeight / logo2Image.height);
            logger.log(`Logo 2 (${LOGO2_FILENAME_IN_BUCKET}) embedded successfully.`);
        } catch (error) {
            logger.error(`Failed to load or embed logo 2 (${LOGO2_FILENAME_IN_BUCKET}):`, error);
        }
    }

    // 6. Draw content
    const logoMargin = 50;
    if (logo1Image) {
      page.drawImage(logo1Image, { x: logoMargin, y: height - logoMargin - logo1Dims.height, width: logo1Dims.width, height: logo1Dims.height });
    }
    if (logo2Image) {
      page.drawImage(logo2Image, { x: width - logoMargin - logo2Dims.width, y: height - logoMargin - logo2Dims.height, width: logo2Dims.width, height: logo2Dims.height });
    }

    let currentY = height - 150;
    const drawCenteredText = (text, font, size, y, color = rgb(0.1, 0.1, 0.1)) => {
        const textWidth = font.widthOfTextAtSize(text, size);
        page.drawText(text, { x: (width - textWidth) / 2, y: y, size: size, font: font, color: color });
        return y - size - 10; // Adjust spacing based on font size
    };

    currentY = drawCenteredText("Certificate of Participation", fontBold, 24, currentY);
    currentY -= 30;
    currentY = drawCenteredText("This certifies that", fontRegular, 14, currentY, rgb(0.2, 0.2, 0.2));
    currentY -= 15;
    currentY = drawCenteredText(certificateFullName, fontBold, 22, currentY, rgb(0, 0.3, 0.6));
    currentY -= 10;
    currentY = drawCenteredText("has successfully completed the educational activity entitled:", fontRegular, 12, currentY, rgb(0.2, 0.2, 0.2));
    currentY -= 10;
    currentY = drawCenteredText("MedSwipe Otolaryngology CME Module", fontBold, 16, currentY);
    currentY -= 10;
    currentY = drawCenteredText("and is awarded", fontRegular, 12, currentY, rgb(0.2, 0.2, 0.2));
    currentY -= 10;
    currentY = drawCenteredText(`${formattedCredits} AMA PRA Category 1 Credits™`, fontBold, 14, currentY);
    currentY -= 10;
    currentY = drawCenteredText("on", fontRegular, 12, currentY, rgb(0.2, 0.2, 0.2));
    currentY -= 10;
    currentY = drawCenteredText(claimDate, fontRegular, 14, currentY);
    currentY -= 40;

    const accreditationText = [
        "Accreditation Statement:",
        "This activity has been planned and implemented in accordance with the accreditation",
        "requirements and policies of the Accreditation Council for Continuing Medical Education",
        "(ACCME) through the joint providership of CME Consultants and MedSwipe."
    ];
    const accreditationTextSize = 9;
    const accreditationLineHeight = 12;
    const accreditationStartX = 72;

    page.drawText(accreditationText[0], { x: accreditationStartX, y: currentY, size: accreditationTextSize, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
    currentY -= accreditationLineHeight;
    for (let i = 1; i < accreditationText.length; i++) {
        page.drawText(accreditationText[i], { x: accreditationStartX, y: currentY, size: accreditationTextSize, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });
        currentY -= accreditationLineHeight;
    }

    // 7. Serialize PDF
    const pdfBytes = await pdfDoc.save();
    logger.log("PDF generated successfully in memory.");

    // 8. Upload to Cloud Storage
    const safeName = certificateFullName.replace(/[^a-zA-Z0-9]/g, "_");
    const timestamp = Date.now();
    const pdfFileName = `${timestamp}_${safeName}_CME.pdf`;
    const filePath = `cme_certificates/${uid}/${pdfFileName}`;
    const file = bucket.file(filePath);

    logger.log(`Attempting to upload PDF to gs://${BUCKET_NAME}/${filePath}`);
    await file.save(Buffer.from(pdfBytes), { metadata: { contentType: "application/pdf" }, public: true });
    logger.log("PDF successfully uploaded to Cloud Storage.");

    // 9. Return public URL
    const publicUrl = file.publicUrl();
    logger.log("Returning success response with public URL:", publicUrl);
    return { success: true, publicUrl: publicUrl, fileName: pdfFileName };

  } catch (error) {
    logger.error("Error during PDF generation or upload:", error);
    if (error instanceof HttpsError) { throw error; }
    throw new HttpsError("internal", "Failed to generate or save the certificate.", error.message);
  }
});

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
        const stripeClient = stripe(stripeSecret);
    
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
// REPLACE the old block with this one
const determineAccessTier = (userData) => {
  // helper: confirm a real Firestore Timestamp
  const tsMs = (ts) =>
    ts && typeof ts === "object" && typeof ts.toMillis === "function"
      ? ts.toMillis()
      : 0;            // treat missing/invalid as expired

  const nowMs       = Date.now();
  const cmeEndMs    = tsMs(userData.cmeSubscriptionEndDate);
  const brEndMs     = tsMs(userData.boardReviewSubscriptionEndDate);
  const credits     = userData.cmeCreditsAvailable || 0;

  // 1. CME Annual (includes Board Review)
  if (userData.cmeSubscriptionActive && cmeEndMs > nowMs) return "cme_annual";

  // 2. Board-Review standalone
  if (userData.boardReviewActive && brEndMs > nowMs)      return "board_review";

  // 3. CME-credits-only (no active annual sub)
  if (credits > 0 && !(userData.cmeSubscriptionActive && cmeEndMs > nowMs))
      return "cme_credits_only";

  // 4. Free / Guest
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
    
          if (!uid || !paid) {
            logger.warn("No uid or not paid in checkout.session.completed – aborting Firestore write.");
            return res.status(200).send("No-op (uid/paid check)");
          }
    
          const userRef = admin.firestore().collection("users").doc(uid);
          const updates = {
            stripeCustomerId: custId,
            isRegistered: true, // User made a purchase, so they are registered
            lastStripeEvent: admin.firestore.Timestamp.now(),
            lastStripeEventType: event.type,
          };
    
          let newAccessTier = "free_guest"; // Default, will be updated
    
          if (session.mode === "subscription") {
            const subId = session.subscription;
            if (!subId) {
              logger.error("No subscription ID on session for checkout.session.completed");
              return res.status(200).send("No subId in session");
            }
    
            let subscription;
            try {
              subscription = await stripeClient.subscriptions.retrieve(subId, { expand: ["items"] });
            } catch (err) {
              logger.error("Subscription fetch failed for checkout.session.completed:", err);
              return res.status(200).send("Sub fetch failed");
            }
    
            const item0 = subscription.items?.data?.[0] || {};
            const startUnix = item0.current_period_start ?? subscription.current_period_start;
            const endUnix = item0.current_period_end ?? subscription.current_period_end;
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
                // CME Annual also grants Board Review access
                boardReviewActive: true, 
                boardReviewTier: "Granted by CME Annual",
                boardReviewSubscriptionId: subId, // Can use the same subId for tracking
                boardReviewSubscriptionStartDate: startTS ?? admin.firestore.FieldValue.serverTimestamp(),
                boardReviewSubscriptionEndDate: endTS,
              });
              newAccessTier = "cme_annual";
            } else {
              logger.warn(`Unhandled subscription tier "${tier}" in checkout.session.completed`);
            }
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
              // Determine access tier after incrementing credits
              // We need to fetch current user data to see if they have an active cme_annual sub
              try {
                const userDoc = await userRef.get();
                if (userDoc.exists()) {
                    const currentData = userDoc.data();
                    const tempUpdatedData = { ...currentData, ...updates, cmeCreditsAvailable: (currentData.cmeCreditsAvailable || 0) + credits };
                    newAccessTier = determineAccessTier(tempUpdatedData);
                } else {
                    // New user, only credits
                    newAccessTier = "cme_credits_only";
                }
              } catch (docError) {
                logger.error("Error fetching user doc for tier determination after credit purchase:", docError);
                newAccessTier = "cme_credits_only"; // Fallback
              }
    
            } else {
              logger.warn(`Unhandled payment tier "${tier}" in checkout.session.completed`);
            }
          } else {
            logger.warn(`Unhandled session mode "${session.mode}" in checkout.session.completed`);
          }
    
          updates.accessTier = newAccessTier; // Set the determined access tier
    
          await userRef.set(updates, { merge: true });
          logger.info(`✅ Firestore updated for ${uid} from checkout.session.completed. New accessTier: ${newAccessTier}`);
          return res.status(200).send("OK (checkout.session.completed)");
        }
    
        // --- Handle customer.subscription.updated, customer.subscription.deleted ---
        // These events handle changes like renewals, cancellations, and expirations.
        if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
          const subscription = dataObject;
          const customerId = subscription.customer;
          const status = subscription.status;
          const cancelAtPeriodEnd = subscription.cancel_at_period_end;
      
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
    
          const planName = subscription.metadata?.planName || userData.boardReviewTier || userData.cmeSubscriptionPlan || "Subscription";
          const tier = subscription.metadata?.tier || (userData.boardReviewActive ? "board_review" : (userData.cmeSubscriptionActive ? "cme_annual" : "unknown"));
    
          const isActiveStatus = status === "active" || status === "trialing";
          
          // --- Define startTS and endTS safely ---
let startTS = null;
let endTS   = null;

const startSec = Number(subscription.current_period_start);
if (Number.isFinite(startSec) && startSec > 0) {
  startTS = admin.firestore.Timestamp.fromMillis(startSec * 1000);
} else {
  logger.warn(
    `Subscription ${subscription.id} has invalid current_period_start: ${subscription.current_period_start}`
  );
}

const endSec = Number(subscription.current_period_end);
if (Number.isFinite(endSec) && endSec > 0) {
  endTS = admin.firestore.Timestamp.fromMillis(endSec * 1000);
} else {
  logger.warn(
    `Subscription ${subscription.id} has invalid current_period_end: ${subscription.current_period_end}`
  );
}
// --- End safe definition ---


          // Update specific subscription type fields
          if (tier === "board_review") {
            updates.boardReviewActive = isActiveStatus;
            updates.boardReviewTier = isActiveStatus ? planName : "Expired/Canceled";
            updates.boardReviewWillCancelAtPeriodEnd = cancelAtPeriodEnd;

            if (isActiveStatus) {
            updates.boardReviewSubscriptionStartDate = startTS || admin.firestore.FieldValue.delete();
            updates.boardReviewSubscriptionEndDate = endTS || admin.firestore.FieldValue.delete();
        } else {
                // If not active, we might want to keep the end date or clear it
                // For now, we'll rely on boardReviewActive: false
            }
          } else if (tier === "cme_annual") {
            updates.cmeSubscriptionActive = isActiveStatus;
            updates.cmeSubscriptionPlan = isActiveStatus ? planName : "Expired/Canceled";
            updates.cmeSubscriptionWillCancelAtPeriodEnd = cancelAtPeriodEnd;

            if (isActiveStatus) {
              updates.cmeSubscriptionStartDate = startTS || admin.firestore.FieldValue.delete();
              updates.cmeSubscriptionEndDate = endTS || admin.firestore.FieldValue.delete();
          }

             // CME Annual also affects Board Review status
        updates.boardReviewActive = isActiveStatus;
        updates.boardReviewTier = isActiveStatus
            ? "Granted by CME Annual"
            : (userData.boardReviewActive ? "Expired/Canceled" : userData.boardReviewTier);

        if (isActiveStatus) {
            if (startTS) updates.boardReviewSubscriptionStartDate = startTS;
            if (endTS) updates.boardReviewSubscriptionEndDate = endTS;
        }
    } else {
        logger.warn(`Unhandled subscription tier "${tier}" in ${event.type}`);
    }

    const potentiallyUpdatedUserData = { ...userData, ...updates };

    // Ensure that if start/end dates became null due to missing Stripe data,
    // determineAccessTier can handle it (it should, as it checks for existence of end date).
    updates.accessTier = determineAccessTier(potentiallyUpdatedUserData);

    await userRef.set(updates, { merge: true });

    logger.info(`Firestore updated for ${uid} from ${event.type}. New accessTier: ${updates.accessTier}`);
    return res.status(200).send(`OK (${event.type})`);
}
        
        // --- Handle invoice.payment_failed ---
        // Useful for downgrading access if a recurring payment fails.
        if (event.type === 'invoice.payment_failed') {
            const invoice = dataObject;
            const customerId = invoice.customer;
            const subscriptionId = invoice.subscription; // ID of the subscription that failed
    
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
    
            // Determine which subscription failed and mark it inactive
            if (userData.boardReviewSubscriptionId === subscriptionId) {
                updates.boardReviewActive = false;
                updates.boardReviewTier = "Payment Failed";
                logger.info(`Marking Board Review inactive for user ${uid} due to payment failure.`);
            }
            if (userData.cmeSubscriptionId === subscriptionId) {
                updates.cmeSubscriptionActive = false;
                updates.cmeSubscriptionPlan = "Payment Failed";
                // If CME Annual fails, Board Review granted by it also becomes inactive
                updates.boardReviewActive = false; 
                updates.boardReviewTier = "Payment Failed (CME Annual)";
                logger.info(`Marking CME Annual (and associated Board Review) inactive for user ${uid} due to payment failure.`);
            }
    
            // Re-determine accessTier
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
exports.recordCmeAnswerV2 = onCall(
  {
    region: "us-central1",
    memory: "512MiB",
    timeoutSeconds: 60,
  },
  async (request) => {
    // 1. Authentication Check
    if (!request.auth) {
      logger.error("recordCmeAnswerV2: Authentication failed. No auth context.");
      throw new HttpsError("unauthenticated", "Please log in to record CME answers.");
    }
    const uid = request.auth.uid;
    logger.info(`recordCmeAnswerV2: Called by authenticated user: ${uid}`);

    // 2. Input Validation
    const { questionId, category, isCorrect, timeSpent } = request.data; // questionId here is the full question text
    if (!questionId || typeof questionId !== "string" || questionId.trim() === "") {
      logger.error("recordCmeAnswerV2: Validation failed. Invalid questionId.", { data: request.data });
      throw new HttpsError("invalid-argument", "A valid question ID is required.");
    }
    if (!category || typeof category !== "string" || category.trim() === "") {
      logger.error("recordCmeAnswerV2: Validation failed. Invalid category.", { data: request.data });
      throw new HttpsError("invalid-argument", "A valid category is required.");
    }
    if (typeof isCorrect !== "boolean") {
      logger.error("recordCmeAnswerV2: Validation failed. Invalid isCorrect flag.", { data: request.data });
      throw new HttpsError("invalid-argument", "A boolean 'isCorrect' flag is required.");
    }
    logger.info(`recordCmeAnswerV2: Processing for QID (text): "${questionId.substring(0, 50)}...", Correct: ${isCorrect}`);

    // 3. Business Logic Constants
    const MINUTES_PER_QUESTION = 4.8;
    const MINUTES_PER_QUARTER_CREDIT = 15;
    const ACCURACY_THRESHOLD = 0.70;
    const MAX_CME_CREDITS_PER_YEAR = 24.0;

    const db = admin.firestore();

    try {
      // 4. Get Active CME Year ID (as before)
      const activeYearId = await getActiveYearId();
      if (!activeYearId) {
        logger.warn(`recordCmeAnswerV2: No active CME year found. Cannot record answer for user ${uid}.`);
        return {
          status: "no_active_year",
          message: "No active CME accreditation year. Credits cannot be awarded at this time.",
          creditedThisAnswer: 0,
          newYearTotalCredits: 0,
          activeYearId: null // Return null for activeYearId
        };
      }
      logger.info(`recordCmeAnswerV2: Active CME Year ID: ${activeYearId} for user ${uid}.`);

      // 5. Check User's Access Tier (as before)
      const userDocRefForTierCheck = db.collection("users").doc(uid);
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
          activeYearId: activeYearId
        };
      }
      logger.info(`recordCmeAnswerV2: User ${uid} has eligible tier '${accessTier}'.`);

      // 6. Firestore Transaction
      let creditedThisAnswer = 0;
      let finalYearTotalCredits = 0;
      let finalTotalAnsweredInYear = 0; // To return to client
      let transactionStatus = "success";
      let transactionMessage = "Answer recorded.";
      let overallCmeStatsAfterUpdate = {};

      const questionIdHash = crypto.createHash('sha256').update(questionId).digest('hex');
      const answerLogDocumentId = `${activeYearId}_${questionIdHash}`;

      await db.runTransaction(async (transaction) => {
        const yearStatsDocRef = db.collection("users").doc(uid).collection("cmeStats").doc(activeYearId);
        const answerLogDocRef = db.collection("users").doc(uid).collection("cmeAnswers").doc(answerLogDocumentId);
        const mainUserDocRef = db.collection("users").doc(uid);
        const allYearStatsCollectionRef = db.collection("users").doc(uid).collection("cmeStats");

        const yearStatsDoc = await transaction.get(yearStatsDocRef);
        const answerLogDoc = await transaction.get(answerLogDocRef);
        const mainUserDocSnap = await transaction.get(mainUserDocRef);
        const allYearStatsSnapshot = await transaction.get(allYearStatsCollectionRef);

        let mainUserData = mainUserDocSnap.exists ? mainUserDocSnap.data() : {};
        if (!mainUserData.cmeStats) {
          mainUserData.cmeStats = { totalAnswered: 0, totalCorrect: 0, creditsEarned: 0.00, creditsClaimed: 0.00 };
        } else {
          mainUserData.cmeStats.totalAnswered = mainUserData.cmeStats.totalAnswered || 0;
          mainUserData.cmeStats.totalCorrect = mainUserData.cmeStats.totalCorrect || 0;
          mainUserData.cmeStats.creditsEarned = mainUserData.cmeStats.creditsEarned || 0.00;
          mainUserData.cmeStats.creditsClaimed = mainUserData.cmeStats.creditsClaimed || 0.00;
        }

        if (answerLogDoc.exists) {
          logger.info(`recordCmeAnswerV2: Question (hash: ${questionIdHash}) already recorded for user ${uid} in year ${activeYearId}. No new credits or overall stat changes.`);
          transactionStatus = "already_recorded_this_year";
          transactionMessage = "This question has already been recorded for CME credit this year.";
          const existingYearData = yearStatsDoc.exists ? yearStatsDoc.data() : { creditsEarned: 0, totalAnsweredInYear: 0 };
          finalYearTotalCredits = existingYearData.creditsEarned || 0;
          finalTotalAnsweredInYear = existingYearData.totalAnsweredInYear || 0;
          overallCmeStatsAfterUpdate = mainUserData.cmeStats;
          return;
        }

        let yearStatsData = { totalAnsweredInYear: 0, totalCorrectInYear: 0, creditsEarned: 0.00 };
        if (yearStatsDoc.exists) {
          yearStatsData = { ...yearStatsData, ...yearStatsDoc.data() };
        }
        yearStatsData.totalAnsweredInYear += 1;
        if (isCorrect) { yearStatsData.totalCorrectInYear += 1; }
        
        finalTotalAnsweredInYear = yearStatsData.totalAnsweredInYear; // Capture after increment

        const accuracyInYear = yearStatsData.totalAnsweredInYear > 0
          ? yearStatsData.totalCorrectInYear / yearStatsData.totalAnsweredInYear
          : 0;
        let oldCreditsEarnedInYear = yearStatsData.creditsEarned || 0.00;
        let newPotentialCreditsInYear = oldCreditsEarnedInYear;
        if (accuracyInYear >= ACCURACY_THRESHOLD) {
          const totalMinutesInYear = yearStatsData.totalAnsweredInYear * MINUTES_PER_QUESTION;
          const quarterCreditsRounded = Math.round(totalMinutesInYear / MINUTES_PER_QUARTER_CREDIT);
          newPotentialCreditsInYear = Math.min(quarterCreditsRounded * 0.25, MAX_CME_CREDITS_PER_YEAR);
        }
        if (newPotentialCreditsInYear > oldCreditsEarnedInYear) {
          creditedThisAnswer = newPotentialCreditsInYear - oldCreditsEarnedInYear;
          yearStatsData.creditsEarned = newPotentialCreditsInYear;
          transactionMessage = `Answer recorded. ${creditedThisAnswer.toFixed(2)} credits earned this answer for year ${activeYearId}.`;
        } else {
            creditedThisAnswer = 0;
            if (yearStatsData.creditsEarned >= MAX_CME_CREDITS_PER_YEAR) {
              transactionMessage = `Answer recorded. Yearly credit limit for ${activeYearId} reached.`;
              transactionStatus = "limit_reached";
            } else if (accuracyInYear < ACCURACY_THRESHOLD && yearStatsData.totalAnsweredInYear > 0) {
              transactionMessage = `Answer recorded. Yearly accuracy for ${activeYearId} below threshold for new credits.`;
              transactionStatus = "accuracy_low";
            } else {
              transactionMessage = `Answer recorded. No change in credits earned this answer for year ${activeYearId}.`;
            }
        }
        yearStatsData.lastUpdated = admin.firestore.FieldValue.serverTimestamp();
        finalYearTotalCredits = yearStatsData.creditsEarned;
        transaction.set(yearStatsDocRef, yearStatsData, { merge: true });
        transaction.set(answerLogDocRef, {
          originalQuestionId: questionId,
          answeredAt: admin.firestore.FieldValue.serverTimestamp(),
          isCorrect: isCorrect,
          category: category,
        });

        mainUserData.cmeStats.totalAnswered = (mainUserData.cmeStats.totalAnswered || 0) + 1;
        if (isCorrect) {
          mainUserData.cmeStats.totalCorrect = (mainUserData.cmeStats.totalCorrect || 0) + 1;
        }

        let totalCumulativeCreditsEarned = 0;
        allYearStatsSnapshot.forEach(doc => {
            if (doc.id !== activeYearId) {
                totalCumulativeCreditsEarned += (doc.data().creditsEarned || 0);
            }
        });
        totalCumulativeCreditsEarned += yearStatsData.creditsEarned;
        mainUserData.cmeStats.creditsEarned = parseFloat(totalCumulativeCreditsEarned.toFixed(2));
        
        overallCmeStatsAfterUpdate = mainUserData.cmeStats;
        transaction.set(mainUserDocRef, mainUserData, { merge: true });

        logger.info(`recordCmeAnswerV2: Transaction for user ${uid}, year ${activeYearId}, QID_hash: ${questionIdHash} successful. Credits this answer (year): ${creditedThisAnswer.toFixed(2)}, New total for year: ${finalYearTotalCredits.toFixed(2)}, Total answered in year: ${finalTotalAnsweredInYear}, New OVERALL earned: ${mainUserData.cmeStats.creditsEarned.toFixed(2)}, Overall answered: ${mainUserData.cmeStats.totalAnswered}`);
      }); // End Transaction

      return {
        status: transactionStatus,
        message: transactionMessage,
        creditedThisAnswer: parseFloat(creditedThisAnswer.toFixed(2)),
        newYearTotalCredits: parseFloat(finalYearTotalCredits.toFixed(2)),
        totalAnsweredInYear: finalTotalAnsweredInYear, // Return this
        activeYearId: activeYearId,
        overallCreditsEarned: parseFloat(overallCmeStatsAfterUpdate.creditsEarned?.toFixed(2) || "0.00"),
        overallTotalAnswered: overallCmeStatsAfterUpdate.totalAnswered || 0,
        overallTotalCorrect: overallCmeStatsAfterUpdate.totalCorrect || 0,
      };

    } catch (error) {
      logger.error(`recordCmeAnswerV2: Error processing for user ${uid}, QID_text: "${questionId.substring(0,50)}...":`, error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError("internal", "An error occurred while recording your CME answer.", error.message);
    }
  }
);
// --- End Callable Function recordCmeAnswerV2 ---

// --- NEW LEADERBOARD CLOUD FUNCTION ---
exports.getLeaderboardData = onCall(
  {
    region: "us-central1", // Or your preferred region
    memory: "512MiB", // Adjust if needed, 512MiB is a good start
    timeoutSeconds: 60, // Standard timeout
  },
  async (request) => {
    logger.info("getLeaderboardData function called", { auth: request.auth });

    // 1. Authentication Check
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "The function must be called while authenticated."
      );
    }
    const currentAuthUid = request.auth.uid;

    // Helper function to get the start of the current week in milliseconds
    // (Monday as the first day of the week)
    function getStartOfWeekMilliseconds(date = new Date()) {
      const d = new Date(date);
      const day = d.getDay(); // 0 (Sun) to 6 (Sat)
      // Adjust diff to make Monday the first day (day === 0 means Sunday, target is -6 days)
      // If day is Sunday (0), diff should be -6 to get to previous Monday.
      // If day is Monday (1), diff should be 0.
      // If day is Saturday (6), diff should be -5.
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const startOfWeekDate = new Date(d.setDate(diff));
      startOfWeekDate.setHours(0, 0, 0, 0);
      return startOfWeekDate.getTime();
    }

    const TOP_N_LEADERBOARD = 10; // Number of users to return for top lists

    try {
      const usersSnapshot = await db.collection("users").get();
      const allEligibleUsersData = [];
      const weekStartMillis = getStartOfWeekMilliseconds();

      usersSnapshot.forEach((doc) => {
        const userData = doc.data();

        // Filter out users who are not registered
        if (userData.isRegistered === true) {
          // Calculate weeklyAnsweredCount
          let weeklyAnsweredCount = 0;
          if (userData.answeredQuestions) {
            for (const questionKey in userData.answeredQuestions) {
              const answer = userData.answeredQuestions[questionKey];
              // Assuming answer.timestamp is stored as milliseconds
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
            // accessTier: userData.accessTier || "free_guest" // Not strictly needed for leaderboard display itself
          });
        }
      });

      logger.info(`Processed ${allEligibleUsersData.length} eligible users.`);

      // --- Prepare data for each leaderboard ---
      let currentUserRanks = {
        xp: null,
        streak: null,
        answered: null,
      };

      // XP Leaderboard
      const sortedByXp = [...allEligibleUsersData].sort((a, b) => b.xp - a.xp);
      const xpLeaderboard = sortedByXp
        .slice(0, TOP_N_LEADERBOARD)
        .map((user, index) => ({
          uid: user.uid,
          username: user.username,
          xp: user.xp,
          level: user.level,
          rank: index + 1,
        }));
      const currentUserXpIndex = sortedByXp.findIndex(u => u.uid === currentAuthUid);
      if (currentUserXpIndex !== -1) {
        const userXpData = sortedByXp[currentUserXpIndex];
        currentUserRanks.xp = {
          rank: currentUserXpIndex + 1,
          username: userXpData.username,
          xp: userXpData.xp,
          level: userXpData.level,
        };
      }

      // Streak Leaderboard
      const sortedByStreak = [...allEligibleUsersData].sort((a, b) => b.currentStreak - a.currentStreak);
      const streakLeaderboard = sortedByStreak
        .slice(0, TOP_N_LEADERBOARD)
        .map((user, index) => ({
          uid: user.uid,
          username: user.username,
          currentStreak: user.currentStreak,
          rank: index + 1,
        }));
      const currentUserStreakIndex = sortedByStreak.findIndex(u => u.uid === currentAuthUid);
      if (currentUserStreakIndex !== -1) {
        const userStreakData = sortedByStreak[currentUserStreakIndex];
        currentUserRanks.streak = {
          rank: currentUserStreakIndex + 1,
          username: userStreakData.username,
          currentStreak: userStreakData.currentStreak,
        };
      }

      // Answered Leaderboard (Weekly)
      const sortedByAnswered = [...allEligibleUsersData].sort((a, b) => b.weeklyAnsweredCount - a.weeklyAnsweredCount);
      const answeredLeaderboard = sortedByAnswered
        .slice(0, TOP_N_LEADERBOARD)
        .map((user, index) => ({
          uid: user.uid,
          username: user.username,
          weeklyAnsweredCount: user.weeklyAnsweredCount,
          rank: index + 1,
        }));
      const currentUserAnsweredIndex = sortedByAnswered.findIndex(u => u.uid === currentAuthUid);
      if (currentUserAnsweredIndex !== -1) {
        const userAnsweredData = sortedByAnswered[currentUserAnsweredIndex];
        currentUserRanks.answered = {
          rank: currentUserAnsweredIndex + 1,
          username: userAnsweredData.username,
          weeklyAnsweredCount: userAnsweredData.weeklyAnsweredCount,
        };
      }

      logger.info("Leaderboard data prepared successfully.");
      return {
        xpLeaderboard,
        streakLeaderboard,
        answeredLeaderboard,
        currentUserRanks,
      };

    } catch (error) {
      logger.error("Error fetching leaderboard data:", error);
      throw new HttpsError(
        "internal",
        "An error occurred while fetching leaderboard data.",
        error.message
      );
    }
  }
);
// --- END LEADERBOARD CLOUD FUNCTION ---