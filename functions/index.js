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


// --- Stripe Webhook Handler (Corrected Version) ---
// --- Stripe Webhook Handler (Corrected Version) ---
exports.stripeWebhookHandler = onRequest(
  {
    region: "us-central1", // Or your preferred region
    timeoutSeconds: 60,
    memory: "256MiB",
    secrets: ["STRIPE_WEBHOOK_SECRET", "STRIPE_SECRET_KEY"] // Make sure both are listed
  },
  async (req, res) => {
    // Use the secret values directly from process.env
    const webhookSecretValue = process.env.STRIPE_WEBHOOK_SECRET;
    const secretKeyValue = process.env.STRIPE_SECRET_KEY; // Get secret key

    // Initialize Stripe client inside the handler
    if (!secretKeyValue) {
        logger.error("CRITICAL: Stripe secret key is missing from environment.");
        res.status(500).send("Webhook Error: Server configuration error (SK).");
        return;
    }
    // Initialize Stripe client here, inside the handler scope
    const stripeClient = stripe(secretKeyValue);

    if (!webhookSecretValue) {
        logger.error("CRITICAL: Webhook secret is missing from environment.");
        res.status(500).send("Webhook Error: Server configuration error (WHS).");
        return;
    }

    logger.info(`stripeWebhookHandler received request: ${req.method} ${req.path}`);

    // Health check for GET requests
    if (req.method === "GET") {
      logger.info("Health check request received. Responding OK.");
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end("OK");
      return;
    }

    // Construct & verify the event
    let event;
    try {
      if (!req.rawBody) { throw new Error("Missing req.rawBody."); }
      const signature = req.headers["stripe-signature"];
      if (!signature) { throw new Error("Missing 'stripe-signature' header."); }

      event = stripeClient.webhooks.constructEvent(req.rawBody, signature, webhookSecretValue);
      logger.info(`Webhook event constructed successfully: ${event.id}, Type: ${event.type}`);
    } catch (err) {
      logger.error(`Webhook signature verification failed: ${err.message}`, { error: err });
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    // Handle the event
    try {
      if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        logger.info(`Processing checkout.session.completed for session: ${session.id}, Mode: ${session.mode}`);

        const uid = session.client_reference_id;
        const paid = session.payment_status === "paid";

        // --- CORRECTED CONDITION: Check only essential 'paid' and 'uid' first ---
        if (paid && uid) {
            const userRef = admin.firestore().collection("users").doc(uid);
            const custId = session.customer; // Get customer ID (might be null)

            // --- Check the mode ---
            if (session.mode === 'subscription') {
                // --- Subscription Logic (Requires Customer ID and Subscription ID) ---
                const subsId = session.subscription;
                if (subsId && custId) { // <<< Keep custId check HERE for subscriptions
                    logger.info(`Handling SUBSCRIPTION completion for user: ${uid}, SubID: ${subsId}, CustID: ${custId}`);
                    const subscriptionStartDate = admin.firestore.FieldValue.serverTimestamp();
                    const planName = session.metadata?.planName || 'subscription'; // Get plan name if available

                    await userRef.set({
                        stripeCustomerId: custId,
                        stripeSubscriptionId: subsId,
                        cmeSubscriptionActive: true,
                        cmeSubscriptionPlan: planName,
                        cmeSubscriptionStartDate: subscriptionStartDate,
                    }, { merge: true });
                    logger.info(`Firestore updated for SUBSCRIPTION user: ${uid}`);
                } else {
                    logger.warn(`Skipping Firestore update for subscription session ${session.id}. Missing subscription ID (${subsId}) or customer ID (${custId}).`);
                }
                // --- End Subscription Logic ---

            } else if (session.mode === 'payment') {
                // --- One-Time Payment Logic (Customer ID is optional) ---
                logger.info(`Handling PAYMENT completion for user: ${uid}, CustID: ${custId || 'N/A'}`); // Log if CustID exists

                let purchasedQuantity = 0;
                // Try to get quantity from webhook payload first
                if (session.line_items && session.line_items.data && session.line_items.data.length > 0) {
                    purchasedQuantity = session.line_items.data[0].quantity || 0;
                    logger.info(`Extracted purchased quantity: ${purchasedQuantity} from webhook line items.`);
                } else {
                     // Fallback: Retrieve session to expand line_items if not included
                     logger.warn(`Line items data missing or empty in webhook for session ${session.id}. Attempting to retrieve session...`);
                     try {
                         const retrievedSession = await stripeClient.checkout.sessions.retrieve(session.id, { expand: ['line_items'] });
                         if (retrievedSession.line_items && retrievedSession.line_items.data && retrievedSession.line_items.data.length > 0) {
                             purchasedQuantity = retrievedSession.line_items.data[0].quantity || 0;
                             logger.info(`Successfully retrieved quantity ${purchasedQuantity} after re-fetching session.`);
                         } else {
                             logger.warn(`Still could not retrieve line items/quantity after re-fetching session ${session.id}.`);
                         }
                     } catch (retrieveError) {
                         logger.error(`Error re-fetching session ${session.id} to get line items:`, retrieveError);
                         // Decide if you want to throw an error here or just log and potentially skip the update
                     }
                }

                // Proceed only if we have a valid quantity
                if (purchasedQuantity > 0) {
                    logger.info(`User ${uid} purchased ${purchasedQuantity} credits.`);
                    // Prepare data to save - include customerId *if* it exists
                    let firestoreUpdateData = {
                        cmeCreditsAvailable: admin.firestore.FieldValue.increment(purchasedQuantity)
                    };
                    if (custId) { // <<< Only add customerId if it's not null/undefined
                        firestoreUpdateData.stripeCustomerId = custId;
                        logger.info(`Saving stripeCustomerId (${custId}) for one-time payment user ${uid}.`);
                    }
                    // Atomically increment credits and potentially save customer ID
                    await userRef.set(firestoreUpdateData, { merge: true });
                    logger.info(`Firestore updated for PAYMENT user: ${uid}. Incremented cmeCreditsAvailable by ${purchasedQuantity}.`);
                } else {
                    logger.warn(`Skipping Firestore update for payment session ${session.id}. Calculated purchased quantity is zero.`);
                }
                // --- End One-Time Payment Logic ---

            } else {
                logger.warn(`Unhandled session mode: ${session.mode} for session ${session.id}`);
            }
        } else {
            // --- Log why the main condition failed ---
            // Use the original custId variable from the outer scope for logging here
            const originalCustIdForLog = session.customer;
            logger.warn(`Skipping Firestore update for session ${session.id}. Conditions not met (Paid=${paid}, UID=${uid}). CustID was: ${originalCustIdForLog}`);
        }
        // --- END CORRECTED CONDITION ---

      } else if (event.type === 'customer.subscription.deleted') {
          // --- HANDLE SUBSCRIPTION CANCELLATION (Keep As Is) ---
          const subscription = event.data.object;
          const customerId = subscription.customer;
          logger.info(`Processing customer.subscription.deleted for CustID: ${customerId}, SubID: ${subscription.id}`);
          const usersRef = admin.firestore().collection('users');
          const querySnapshot = await usersRef.where('stripeCustomerId', '==', customerId).limit(1).get();

          if (!querySnapshot.empty) {
              const userDoc = querySnapshot.docs[0];
              logger.info(`Found user ${userDoc.id} for subscription cancellation.`);
              await userDoc.ref.update({
                  cmeSubscriptionActive: false,
              });
              logger.info(`Set cmeSubscriptionActive to false for user ${userDoc.id}.`);
          } else {
              logger.warn(`Could not find user with Stripe Customer ID ${customerId} to handle subscription deletion.`);
          }
          // --- END HANDLE SUBSCRIPTION CANCELLATION ---

      } else {
          logger.info(`Received unhandled event type: ${event.type}`);
      }

      // Acknowledge receipt (keep this)
      logger.info(`Acknowledging webhook event: ${event.id}`);
      res.status(200).json({ received: true, eventId: event.id });

    } catch (dbErr) {
      // Log Firestore or other processing errors
      logger.error(`Webhook handler error for event ${event?.id}, type ${event?.type}: ${dbErr.message}`, { error: dbErr });
      res.status(500).send(`Webhook Error: Internal error processing event ${event?.id}.`);
    }
  }
);
// --- End Stripe Webhook Handler ---


// --- createStripeCheckoutSession (Updated to v2 and using process.env) ---
exports.createStripeCheckoutSession = onCall(
  {
    region: "us-central1", // Or your preferred region
    memory: "256MiB",
    secrets: ["STRIPE_SECRET_KEY"] // Declare the secret needed
  },
  async (request) => { // Use request parameter for v2
    logger.log("createStripeCheckoutSession called.");

    // 1. Auth check (using request.auth)
    if (!request.auth) {
      logger.error("Authentication failed: No auth context.");
      throw new HttpsError("unauthenticated", "You must be logged in to start a checkout.");
    }
    const uid = request.auth.uid; // Get UID from request.auth
    logger.log(`Authenticated user: ${uid}`);

    // 2. Validate priceId (using request.data)
    const priceId = request.data.priceId; // Get priceId from request.data
    const quantity = request.data.quantity || 1;

// Basic validation for quantity (optional but good practice)
if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1) {
    logger.warn(`Invalid quantity received: ${request.data.quantity}. Defaulting to 1.`);
    quantity = 1; // Reset to 1 if invalid data received
}
if (!priceId || typeof priceId !== "string") {
  logger.error("Validation failed: Invalid Price ID.", { data: request.data });
  throw new HttpsError("invalid-argument", "A valid Price ID must be provided.");
}
logger.log(`Received Price ID: ${priceId}, Quantity: ${quantity}`); 

    // 3. Initialize Stripe Client using environment variable populated by 'secrets'
    const secretKey = process.env.STRIPE_SECRET_KEY; // Access the secret
    if (!secretKey) { // Check if the secret was actually populated
      logger.error("CRITICAL: Stripe secret key is missing from environment. Check secret configuration and deployment.");
      throw new HttpsError("internal", "Server configuration error [SK].");
    }
    const stripeClient = stripe(secretKey); // Initialize Stripe here
    logger.info("Stripe client initialized successfully within createCheckout handler.");

    // 4. Define URLs (Consider making these configurable later)
    const YOUR_APP_BASE_URL = "https://daboss786.github.io/MedSwipe-testing"; // <<< Double-check this URL is correct
    const successUrl = `${YOUR_APP_BASE_URL}/checkout-success.html`; // Example success page
    const cancelUrl = `${YOUR_APP_BASE_URL}/checkout-cancel.html`;   // Example cancel page
    let sessionMode = 'subscription'; // Default to subscription mode

    // IMPORTANT: Replace 'price_xxxxxxxxxxxxxxx' below with your ACTUAL $8 credit price ID
    const creditPriceIdFromStripe = 'price_1RKXlYR9wwfN8hwyGznI4iXS'; // <<< PASTE YOUR $8 PRICE ID HERE
    
    if (priceId === creditPriceIdFromStripe) {
        sessionMode = 'payment'; // Set mode to 'payment' for the one-time credit purchase
        logger.info(`Detected Credit Price ID (${priceId}), setting mode to 'payment'.`);
    } else {
        logger.info(`Detected Subscription Price ID (${priceId}), setting mode to 'subscription'.`);
    }

    // 5. Create session
    try {
      logger.log(`Creating Stripe session for user ${uid} with price ${priceId}`);
      const session = await stripeClient.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: sessionMode, // Use the dynamic mode ('payment' or 'subscription')
        // --- CHANGE THIS LINE ---
        line_items: [{ price: priceId, quantity: quantity }], // Use the dynamic quantity
        client_reference_id: uid, // Use client_reference_id for passing UID
        success_url: successUrl,
        cancel_url: cancelUrl,
        // Optionally pass plan name if needed by webhook immediately
        // metadata: {
        //    planName: request.data.planName // Assuming client sends planName along with priceId
        // }
      });

      logger.log(`Stripe session created: ${session.id}`);
      return { sessionId: session.id }; // Return only the session ID
    } catch (error) {
      logger.error("Stripe session creation failed:", error);
      throw new HttpsError("internal", "Failed to create Stripe checkout session.", error.message);
    }
  }
); // End createStripeCheckoutSession

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