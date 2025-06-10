// emailxp/backend/controllers/trackingController.js
const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const OpenEvent = require('../models/OpenEvent');
const ClickEvent = require('../models/ClickEvent'); // --- NEW: Import ClickEvent model ---

// A 1x1 transparent GIF image, base64 encoded.
const transparentGif = Buffer.from(
    'R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',
    'base64'
);

// @desc    Track email open
// @route   GET /api/track/open/:campaignId/:subscriberId
// @access  Public
const trackOpen = asyncHandler(async (req, res) => {
    const { campaignId, subscriberId } = req.params;

    res.set('Content-Type', 'image/gif');
    res.send(transparentGif);

    try {
        if (!mongoose.Types.ObjectId.isValid(campaignId) || !mongoose.Types.ObjectId.isValid(subscriberId)) {
            console.error(`Tracking Error: Invalid Campaign ID (${campaignId}) or Subscriber ID (${subscriberId}) provided for open tracking.`);
            return;
        }

        await OpenEvent.create({
            campaign: campaignId,
            subscriber: subscriberId,
        });

        console.log(`Email Open Tracked: Campaign ID ${campaignId}, Subscriber ID ${subscriberId}`);

    } catch (error) {
        console.error(`Error saving open event for Campaign ${campaignId}, Subscriber ${subscriberId}:`, error);
    }
});

// @desc    Track email click
// @route   GET /api/track/click/:campaignId/:subscriberId?url=<originalUrl>
// @access  Public (This route is hit by email clients, so it must be public)
const trackClick = asyncHandler(async (req, res) => {
    const { campaignId, subscriberId } = req.params;
    const { url: originalUrl } = req.query; // Get the original URL from query parameters

    // --- IMPORTANT: Redirect the user immediately to the original URL ---
    // This is crucial for a good user experience. The database operation happens in the background.
    if (originalUrl) {
        // Ensure the URL is fully qualified and secure if possible
        try {
            const decodedUrl = decodeURIComponent(originalUrl); // Decode the URL
            // Basic validation for URL format
            if (!decodedUrl.startsWith('http://') && !decodedUrl.startsWith('https://')) {
                // Prepend https:// if not present for safer redirection, or handle as error
                res.redirect(`https://${decodedUrl}`);
            } else {
                res.redirect(decodedUrl);
            }
        } catch (error) {
            console.error(`Tracking Error: Invalid URL for redirection: ${originalUrl}. Error:`, error);
            // Fallback: if URL is invalid, redirect to a default safe page or show an error.
            res.status(400).send('Invalid URL for tracking');
            return; // Stop processing
        }
    } else {
        res.status(400).send('Missing URL for tracking');
        return; // Stop processing
    }

    // --- Log the click event asynchronously after sending the response ---
    try {
        if (!mongoose.Types.ObjectId.isValid(campaignId) || !mongoose.Types.ObjectId.isValid(subscriberId)) {
            console.error(`Tracking Error: Invalid Campaign ID (${campaignId}) or Subscriber ID (${subscriberId}) provided for click tracking.`);
            return;
        }

        await ClickEvent.create({
            campaign: campaignId,
            subscriber: subscriberId,
            originalUrl: decodeURIComponent(originalUrl), // Store the decoded URL
            // ipAddress: req.ip,
            // userAgent: req.headers['user-agent'],
        });

        console.log(`Email Click Tracked: Campaign ID ${campaignId}, Subscriber ID ${subscriberId}, URL: ${originalUrl}`);

    } catch (error) {
        console.error(`Error saving click event for Campaign ${campaignId}, Subscriber ${subscriberId}, URL ${originalUrl}:`, error);
        // Do NOT send another response here, as res.redirect() has already sent the response header.
    }
});

module.exports = {
    trackOpen,
    trackClick, // --- NEW: Export the new trackClick function ---
};