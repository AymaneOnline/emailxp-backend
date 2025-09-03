const Tag = require('../models/Tag');
const Subscriber = require('../models/Subscriber');
const logger = require('../utils/logger');

// Run tag cleanup every 24 hours
const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000;

async function cleanupUnusedTags() {
    try {
        // Get all tags
        const tags = await Tag.find({});
        
        for (const tag of tags) {
            // Check if any subscriber uses this tag
            const hasSubscribers = await Subscriber.exists({ tags: tag._id });
            
            if (!hasSubscribers) {
                // If no subscribers use this tag, delete it
                await Tag.deleteOne({ _id: tag._id });
                logger.info(`Cleaned up unused tag: ${tag.name}`);
            }
        }
        
        logger.info('Tag cleanup completed successfully');
    } catch (error) {
        logger.error('Error during tag cleanup:', error);
    }
}

// Start the cleanup service
function startTagCleanupService() {
    // Run initial cleanup
    cleanupUnusedTags();
    
    // Schedule periodic cleanup
    setInterval(cleanupUnusedTags, CLEANUP_INTERVAL);
    
    logger.info('Tag cleanup service started');
}

module.exports = {
    startTagCleanupService
};
