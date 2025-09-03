const Tag = require('../models/Tag');
const Subscriber = require('../models/Subscriber');

async function cleanupTagsForSubscriber(subscriberId) {
    try {
        // Get the subscriber's tags before deletion
        const subscriber = await Subscriber.findById(subscriberId).select('tags');
        if (!subscriber || !subscriber.tags) return;

        // For each tag of this subscriber
        for (const tagId of subscriber.tags) {
            // Check if any other subscriber uses this tag
            const otherSubscriberExists = await Subscriber.exists({
                _id: { $ne: subscriberId }, // exclude the subscriber being deleted
                tags: tagId
            });

            // If no other subscriber uses this tag, delete it
            if (!otherSubscriberExists) {
                await Tag.deleteOne({ _id: tagId });
            }
        }
    } catch (error) {
        console.error('Error cleaning up tags:', error);
    }
}

module.exports = {
    cleanupTagsForSubscriber
};
