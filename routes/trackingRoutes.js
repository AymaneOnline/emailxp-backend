// emailxp/backend/routes/trackingRoutes.js
const express = require('express');
const router = express.Router();

// --- NEW IMPORTS REQUIRED FOR UNSUBSCRIBE ROUTE ---
const Subscriber = require('../models/Subscriber');
const Campaign = require('../models/Campaign'); // Assuming Campaign model exists
const logger = require('../utils/logger'); // Assuming your logger utility is here
// --- END NEW IMPORTS ---

const { trackOpen, trackClick } = require('../controllers/trackingController'); // --- MODIFIED: Import trackClick ---

// This route does NOT require authentication because it's hit by email clients
// which don't have user tokens.

router.get('/open/:campaignId/:subscriberId', trackOpen);

// --- NEW ROUTE: For click tracking ---
// The actual URL being clicked will be passed as a query parameter (e.g., ?url=...)
router.get('/click/:campaignId/:subscriberId', trackClick);

// --- PUBLIC ROUTE: UNSUBSCRIBE ---
// This route does NOT use the 'protect' middleware as it needs to be publicly accessible
// from email links.
router.get('/unsubscribe/:subscriberId', async (req, res) => {
  const { subscriberId } = req.params;
  const { campaignId } = req.query; // Optionally track which campaign the unsubscribe came from

  try {
    const subscriber = await Subscriber.findById(subscriberId);

    if (!subscriber) {
      logger.error(`[Unsubscribe] Subscriber not found for ID: ${subscriberId}`);
      return res.status(404).send('Subscriber not found or already unsubscribed.');
    }

    // Check the current status (using the 'status' enum now)
    if (subscriber.status === 'unsubscribed') {
      logger.warn(`[Unsubscribe] Subscriber ${subscriber.email} (ID: ${subscriberId}) is already unsubscribed.`);
      return res.status(200).send('You have already unsubscribed from our emails.');
    }

    // Set the status to 'unsubscribed'
    subscriber.status = 'unsubscribed';
    await subscriber.save();

    logger.info(`[Unsubscribe] Subscriber ${subscriber.email} (ID: ${subscriberId}) successfully unsubscribed.`);

    if (campaignId) {
      logger.info(`[Unsubscribe] Unsubscribe originated from Campaign ID: ${campaignId}`);
      // Optional: Update campaign unsubscribe stats here if you add a field to the Campaign model
    }

    // --- Unsubscribe Confirmation HTML ---
    res.status(200).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Unsubscribe Successful</title>
          <style>
              body { font-family: sans-serif; text-align: center; padding: 50px; line-height: 1.6; }
              .container { max-width: 600px; margin: 0 auto; background-color: #f9f9f9; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
              h1 { color: #4CAF50; margin-bottom: 20px; }
              p { color: #555; font-size: 1.1em; }
              .icon { font-size: 3em; margin-bottom: 20px; }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="icon" style="color: #4CAF50;">✅</div>
              <h1>You have successfully unsubscribed!</h1>
              <p>You will no longer receive marketing emails from us.</p>
              <p>We're sorry to see you go. If you ever change your mind, you can always re-subscribe via our website.</p>
          </div>
      </body>
      </html>
    `);

  } catch (error) {
    logger.error(`[Unsubscribe Error] Failed to unsubscribe subscriber ID ${subscriberId}:`, error);
    res.status(500).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Unsubscribe Error</title>
            <style>
                body { font-family: sans-serif; text-align: center; padding: 50px; line-height: 1.6; }
                .container { max-width: 600px; margin: 0 auto; background-color: #f9f9f9; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                h1 { color: #f44336; margin-bottom: 20px; }
                p { color: #555; font-size: 1.1em; }
                .icon { font-size: 3em; color: #f44336; margin-bottom: 20px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="icon">⚠️</div>
                <h1>Oops! Something went wrong.</h1>
                <p>An error occurred while processing your unsubscribe request. Please try again later or contact support if the issue persists.</p>
                <p>We apologize for the inconvenience.</p>
            </div>
        </body>
        </html>
    `);
  }
});

module.exports = router;