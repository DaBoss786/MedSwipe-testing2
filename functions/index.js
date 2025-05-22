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

// --- Stripe Webhook Handler (Fully Updated) ---
exports.stripeWebhookHandler = onRequest(
  {
    region: "us-central1",
    timeoutSeconds: 120,
    memory: "256MiB",
    secrets: ["STRIPE_WEBHOOK_SECRET", "STRIPE_SECRET_KEY"],
  },
  async (req, res) => {
    const webhookSecretValue = process.env.STRIPE_WEBHOOK_SECRET;
    const secretKeyValue = process.env.STRIPE_SECRET_KEY;

    if (!secretKeyValue) {
      logger.error(
        "CRITICAL: Stripe secret key is missing from environment for webhook."
      );
      res.status(500).send("Webhook Error: Server configuration error (SK).");
      return;
    }

    const stripeClient = stripe(secretKeyValue);

    if (!webhookSecretValue) {
      logger.error(
        "CRITICAL: Webhook secret is missing from environment for webhook."
      );
      res.status(500).send("Webhook Error: Server configuration error (WHS).");
      return;
    }

    logger.info(`stripeWebhookHandler received request: ${req.method} ${req.path}`);

    // --- Health check endpoint ---
    if (req.method === "GET") {
      logger.info("Health check: OK.");
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("OK");
      return;
    }

    // --- Verify signature & construct event ---
    let event;
    try {
      event = stripeClient.webhooks.constructEvent(
        req.rawBody,
        req.headers["stripe-signature"],
        webhookSecretValue
      );
      logger.info(`Webhook event: ${event.id}, Type: ${event.type}`);
    } catch (err) {
      logger.error(`Webhook signature verification failed: ${err.message}`, {
        error: err,
      });
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    // --- Main processing ---
    try {
      if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        logger.info(
          `Processing checkout.session.completed: ${session.id}, Mode: ${session.mode}, Payment: ${session.payment_status}`
        );

        const uid = session.client_reference_id;
        const paid = session.payment_status === "paid";
        const stripeCustomerId = session.customer;
        const metadata = session.metadata || {};

        let tier = metadata.tier;
        let planName = metadata.planName;

        logger.info(
          `Webhook: checkout.session.completed - UID: ${uid}, Session Tier: ${tier}, Session PlanName: ${planName}, StripeCustID: ${stripeCustomerId}`
        );

        if (paid && uid) {
          const userRef = admin.firestore().collection("users").doc(uid);
          let userDataToUpdate = {
            stripeCustomerId: stripeCustomerId || null,
            isRegistered: true,
          };

          // --- SUBSCRIPTION MODE ---
          if (session.mode === "subscription") {
            const stripeSubscriptionId = session.subscription; // Subscription ID

            if (stripeSubscriptionId && stripeCustomerId) {
              logger.info(
                `Webhook: Processing subscription - User: ${uid}, SubID: ${stripeSubscriptionId}`
              );

              let currentPeriodEndTimestamp = null;
              let subscriptionObject = null;

              try {
                subscriptionObject = await stripeClient.subscriptions.retrieve(
                  stripeSubscriptionId,
                  {
                    expand: ["items", "latest_invoice.payment_intent"],
                  }
                );
                logger.info(
                  `Webhook: Retrieved Stripe Subscription object for ${stripeSubscriptionId}. Status: ${subscriptionObject.status}`
                );

                // Fallback: get tier/planName from subscription metadata
                if (!tier && subscriptionObject.metadata?.tier) {
                  tier = subscriptionObject.metadata.tier;
                  logger.info(
                    `Webhook: Tier updated from subscription metadata: ${tier}`
                  );
                }
                if (!planName && subscriptionObject.metadata?.planName) {
                  planName = subscriptionObject.metadata.planName;
                  logger.info(
                    `Webhook: PlanName updated from subscription metadata: ${planName}`
                  );
                }

                // Determine period end
                let periodEndUnixTimestamp = null;
                if (
                  subscriptionObject.items?.data?.length > 0 &&
                  subscriptionObject.items.data[0].period
                ) {
                  periodEndUnixTimestamp =
                    subscriptionObject.items.data[0].period.end;
                } else if (subscriptionObject.current_period_end) {
                  logger.warn(
                    `Webhook: Using fallback subscription.current_period_end for SubID: ${stripeSubscriptionId}`
                  );
                  periodEndUnixTimestamp = subscriptionObject.current_period_end;
                }

                if (periodEndUnixTimestamp) {
                  currentPeriodEndTimestamp = admin.firestore.Timestamp.fromDate(
                    new Date(periodEndUnixTimestamp * 1000)
                  );
                  logger.info(
                    `Webhook: Subscription ${stripeSubscriptionId} effective period_end: ${new Date(
                      periodEndUnixTimestamp * 1000
                    ).toISOString()}`
                  );
                } else {
                  logger.warn(
                    `Webhook: Subscription ${stripeSubscriptionId} is missing a period end.`
                  );
                }
              } catch (subError) {
                logger.error(
                  `Webhook: Error retrieving Stripe subscription ${stripeSubscriptionId}:`,
                  subError
                );
              }

              // --- Board Review tier ---
              if (tier === "board_review") {
                userDataToUpdate.boardReviewActive = true;
                userDataToUpdate.boardReviewTier =
                  planName || "Board Review Subscription";
                userDataToUpdate.boardReviewSubscriptionId = stripeSubscriptionId;
                userDataToUpdate.boardReviewSubscriptionStartDate =
                  admin.firestore.FieldValue.serverTimestamp();
                if (currentPeriodEndTimestamp) {
                  userDataToUpdate.boardReviewSubscriptionEndDate =
                    currentPeriodEndTimestamp;
                }

                // --- CME Annual tier ---
              } else if (tier === "cme_annual") {
                userDataToUpdate.cmeSubscriptionActive = true;
                userDataToUpdate.cmeSubscriptionPlan =
                  planName || "CME Annual Subscription";
                userDataToUpdate.cmeSubscriptionId = stripeSubscriptionId;
                userDataToUpdate.cmeSubscriptionStartDate =
                  admin.firestore.FieldValue.serverTimestamp();
                if (currentPeriodEndTimestamp) {
                  userDataToUpdate.cmeSubscriptionEndDate =
                    currentPeriodEndTimestamp;
                }

                // --- Unknown tier ---
              } else {
                logger.warn(
                  `Webhook: Unhandled subscription tier: '${tier}' for session ${session.id}. PlanName: ${planName}`
                );
              }
            } else {
              logger.warn(
                `Webhook: Skipping subscription update for session ${session.id}. Missing SubID (${stripeSubscriptionId}) or CustID (${stripeCustomerId}).`
              );
            }

            // --- PAYMENT MODE (one-time credits) ---
          } else if (session.mode === "payment") {
            if (tier === "cme_credits") {
              let purchasedQuantity = 0;

              // Try to read line items directly
              if (
                session.line_items?.data?.length > 0
              ) {
                purchasedQuantity = session.line_items.data[0].quantity || 0;
              } else {
                // Fallback: re-fetch session with expanded line items
                try {
                  const retrievedSession =
                    await stripeClient.checkout.sessions.retrieve(session.id, {
                      expand: ["line_items"],
                    });
                  if (retrievedSession.line_items?.data?.length > 0) {
                    purchasedQuantity =
                      retrievedSession.line_items.data[0].quantity || 0;
                  }
                } catch (retrieveError) {
                  logger.error(
                    `Error re-fetching session ${session.id} for line items:`,
                    retrieveError
                  );
                }
              }

              if (purchasedQuantity > 0) {
                userDataToUpdate.cmeCreditsAvailable =
                  admin.firestore.FieldValue.increment(purchasedQuantity);
                logger.info(
                  `Webhook: Prepared CME Credits update for ${uid}, Qty: ${purchasedQuantity}`
                );
              } else {
                logger.warn(
                  `Webhook: Skipping CME Credits update for session ${session.id}, zero quantity.`
                );
              }
            } else {
              logger.warn(
                `Webhook: Unhandled payment tier: '${tier}' for session ${session.id}. PlanName: ${planName}`
              );
            }
          } else {
            logger.warn(
              `Webhook: Unhandled session mode: ${session.mode} for session ${session.id}`
            );
          }

          // --- Commit updates to Firestore (if any meaningful) ---
          const hasMeaningfulUpdates =
            Object.keys(userDataToUpdate).some(
              (key) => !["stripeCustomerId", "isRegistered"].includes(key)
            ) || userDataToUpdate.cmeCreditsAvailable;

          if (
            hasMeaningfulUpdates ||
            userDataToUpdate.stripeCustomerId !== undefined ||
            userDataToUpdate.isRegistered !== undefined
          ) {
            await userRef.set(userDataToUpdate, { merge: true });
            logger.info(
              `Webhook: Firestore updated for user: ${uid}. Data:`,
              JSON.stringify(userDataToUpdate)
            );
          } else {
            logger.info(
              `Webhook: No specific tier-based Firestore updates for user: ${uid}.`
            );
          }
        } else {
          logger.warn(
            `Webhook: Skipping Firestore update for session ${session.id}. Not paid or UID missing. Paid=${paid}, UID=${uid}.`
          );
        }

        // --- SUBSCRIPTION DELETE / UPDATE EVENTS ---
      } else if (
        event.type === "customer.subscription.deleted" ||
        event.type === "customer.subscription.updated"
      ) {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        const subscriptionStatus = subscription.status;
        const subscriptionId = subscription.id;
        const cancelAtPeriodEnd = subscription.cancel_at_period_end;
        const currentPeriodEndFromEvent = subscription.current_period_end
          ? admin.firestore.Timestamp.fromDate(
              new Date(subscription.current_period_end * 1000)
            )
          : null;

        const subMetadata = subscription.metadata || {};
        const subTier = subMetadata.tier;

        logger.info(
          `Webhook: Processing ${event.type}: CustID: ${customerId}, SubID: ${subscriptionId}, Status: ${subscriptionStatus}, CancelAtEnd: ${cancelAtPeriodEnd}, SubTier: ${subTier}`
        );

        // Find Firestore user(s) with this customerId
        const usersRef = admin.firestore().collection("users");
        const querySnapshot = await usersRef
          .where("stripeCustomerId", "==", customerId)
          .get();

        if (!querySnapshot.empty) {
          querySnapshot.forEach(async (userDoc) => {
            logger.info(
              `Webhook: Found user ${userDoc.id} for subscription event for customer ${customerId}.`
            );

            const userData = userDoc.data();
            let updates = {};

            const isActiveNow =
              subscriptionStatus === "active" || subscriptionStatus === "trialing";
            const willDeactivate =
              subscriptionStatus === "canceled" ||
              subscriptionStatus === "unpaid" ||
              cancelAtPeriodEnd;

            // Determine which subscription this event corresponds to
            let effectiveTier = subTier;
            if (!effectiveTier) {
              if (userData.boardReviewSubscriptionId === subscriptionId)
                effectiveTier = "board_review";
              else if (userData.cmeSubscriptionId === subscriptionId)
                effectiveTier = "cme_annual";
              logger.info(
                `Webhook: Tier for SubID ${subscriptionId} determined by matching stored IDs: ${effectiveTier}`
              );
            }

            if (
              effectiveTier === "board_review" &&
              userData.boardReviewSubscriptionId === subscriptionId
            ) {
              updates.boardReviewActive = isActiveNow && !willDeactivate;
              if (currentPeriodEndFromEvent)
                updates.boardReviewSubscriptionEndDate = currentPeriodEndFromEvent;
            } else if (
              effectiveTier === "cme_annual" &&
              userData.cmeSubscriptionId === subscriptionId
            ) {
              updates.cmeSubscriptionActive = isActiveNow && !willDeactivate;
              if (currentPeriodEndFromEvent)
                updates.cmeSubscriptionEndDate = currentPeriodEndFromEvent;
            } else {
              logger.warn(
                `Webhook: Subscription ID ${subscriptionId} from event did not match a known subscription type or tier for user ${userDoc.id}.`
              );
            }

            if (Object.keys(updates).length > 0) {
              await userDoc.ref.update(updates);
              logger.info(
                `Webhook: Updated Firestore for user ${userDoc.id} from ${event.type}:`,
                updates
              );
            }
          });
        } else {
          logger.warn(
            `Webhook: No user found with Stripe CustID ${customerId} for event ${event.type}.`
          );
        }

        // --- OTHER EVENT TYPES ---
      } else {
        logger.info(`Received unhandled event type: ${event.type}`);
      }

      res.status(200).json({ received: true, eventId: event.id });
    } catch (err) {
      logger.error(
        `Webhook handler error for event ${event?.id}, type ${event?.type}: ${err.message}`,
        { error: err, stack: err.stack }
      );
      res
        .status(500)
        .send(`Webhook Error: Internal error processing event ${event?.id}.`);
    }
  }
);



// --- createStripeCheckoutSession (Updated) ---
exports.createStripeCheckoutSession = onCall(
  {
    region: "us-central1",
    memory: "256MiB",
    secrets: ["STRIPE_SECRET_KEY"],
  },
  async (request) => {
    logger.log("createStripeCheckoutSession called with data:", request.data);

    // --- Authentication check ---
    if (!request.auth) {
      logger.error("Authentication failed: No auth context.");
      throw new HttpsError(
        "unauthenticated",
        "You must be logged in to start a checkout."
      );
    }
    const uid = request.auth.uid;
    logger.log(`Authenticated user: ${uid}`);

    // --- Validate client-supplied data ---
    const priceId = request.data.priceId;
    const clientPlanName = request.data.planName;
    const clientTier = request.data.tier;
    let quantity = request.data.quantity || 1;

    if (!priceId || typeof priceId !== "string") {
      logger.error("Validation failed: Invalid Price ID.", {
        data: request.data,
      });
      throw new HttpsError("invalid-argument", "A valid Price ID must be provided.");
    }

    if (
      typeof quantity !== "number" ||
      !Number.isInteger(quantity) ||
      quantity < 1
    ) {
      logger.warn(`Invalid quantity received: ${request.data.quantity}. Defaulting to 1.`);
      quantity = 1;
    }

    logger.log(
      `Received Price ID: ${priceId}, PlanName: ${clientPlanName}, Tier: ${clientTier}, Quantity: ${quantity}`
    );

    // --- Initialize Stripe ---
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      logger.error("CRITICAL: Stripe secret key is missing from environment.");
      throw new HttpsError("internal", "Server configuration error [SK].");
    }
    const stripeClient = stripe(secretKey);
    logger.info("Stripe client initialized for createCheckoutSession.");

    // --- URLs ---
    const YOUR_APP_BASE_URL = "https://daboss786.github.io/MedSwipe-testing2";
    const successUrl = `${YOUR_APP_BASE_URL}/checkout-success.html`;
    const cancelUrl = `${YOUR_APP_BASE_URL}/checkout-cancel.html?tier=${encodeURIComponent(
      clientTier || ""
    )}`; // Pass tier back to cancel URL

    // --- Determine session mode ---
    let sessionMode = "subscription";
    const creditPriceIdFromStripe = "price_1RKXlYR9wwfN8hwyGznI4iXS"; // CME Credit Price ID

    if (priceId === creditPriceIdFromStripe) {
      sessionMode = "payment";
      logger.info(
        `Detected Credit Price ID (${priceId}), setting mode to 'payment'.`
      );
    } else {
      quantity = 1; // Subscriptions always have quantity 1
      logger.info(
        `Detected Subscription Price ID (${priceId}), setting mode to 'subscription'.`
      );
    }

    try {
      logger.log(
        `Creating Stripe session for user ${uid} with price ${priceId}, mode: ${sessionMode}, quantity: ${quantity}`
      );

      const sessionParams = {
        payment_method_types: ["card"],
        mode: sessionMode,
        line_items: [{ price: priceId, quantity }],
        client_reference_id: uid,
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          planName:
            clientPlanName ||
            (sessionMode === "subscription" ? "Subscription" : "One-time Purchase"),
          tier:
            clientTier ||
            (sessionMode === "subscription"
              ? "unknown_subscription_tier"
              : "credits_purchase"),
        },
      };

      if (sessionMode === "subscription") {
        sessionParams.subscription_data = {
          metadata: {
            // Add to subscription_data for direct access on subscription object
            planName: clientPlanName || "Subscription",
            tier: clientTier || "unknown_subscription_tier",
          },
        };
      }

      const session = await stripeClient.checkout.sessions.create(sessionParams);
      logger.log(`Stripe session created: ${session.id} with session metadata:`, session.metadata);

      if (sessionMode === "subscription" && session.subscription) {
        logger.info(`Associated Stripe Subscription ID: ${session.subscription}`);
      }

      return { sessionId: session.id };
    } catch (error) {
      logger.error("Stripe session creation failed:", error);
      const stripeErrorMessage = error.raw ? error.raw.message : error.message;
      throw new HttpsError(
        "internal",
        `Failed to create Stripe checkout session: ${stripeErrorMessage}`
      );
    }
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