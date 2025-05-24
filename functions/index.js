// functions/index.js
// --- v2 Imports ---
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onRequest } = require("firebase-functions/v2/https"); // For webhook
const { logger } = require("firebase-functions"); // Use v1 logger for now, or switch to v2 logger if preferred
const admin = require("firebase-admin");
const stripe = require("stripe");
const { defineString } = require("firebase-functions/params");
const { PDFDocument, StandardFonts, rgb, degrees } = require("pdf-lib"); // Added degrees

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