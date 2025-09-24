// emailxp/backend/utils/behavioralTriggerScheduler.js

const cron = require('node-cron');
const BehavioralTrigger = require('../models/BehavioralTrigger');
const behavioralTriggerService = require('../services/behavioralTriggerService');
const logger = require('../utils/logger');

// Basic logger to control output based on environment
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const loggerInstance = {
    log: (...args) => {
        if (!IS_PRODUCTION) {
            console.log(...args);
        }
    },
    warn: (...args) => {
        console.warn(...args);
    },
    error: (...args) => {
        console.error(...args);
    }
};

/**
 * @desc Starts the cron job for checking behavioral triggers periodically.
 * This runs every 5 minutes and processes any pending behavioral triggers.
 */
const startBehavioralTriggerScheduler = () => {
    // Run every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
        loggerInstance.log('[BehavioralTriggerScheduler] Running behavioral trigger check...');
        
        try {
            // Find active triggers that haven't been checked recently
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            
            const triggers = await BehavioralTrigger.find({
                isActive: true,
                $or: [
                    { lastFired: { $exists: false } },
                    { lastFired: { $lt: oneHourAgo } }
                ]
            }).limit(100); // Limit to prevent overwhelming the system
            
            if (triggers.length === 0) {
                loggerInstance.log('[BehavioralTriggerScheduler] No triggers need processing.');
                return;
            }
            
            loggerInstance.log(`[BehavioralTriggerScheduler] Found ${triggers.length} triggers to process.`);
            
            // Process each trigger (in a real implementation, this might check for recent events)
            for (const trigger of triggers) {
                try {
                    // This is a placeholder - in a real implementation, we would check for recent events
                    // that match this trigger and process them
                    
                    // Update last checked time
                    trigger.lastFired = new Date();
                    await trigger.save();
                    
                    loggerInstance.log(`[BehavioralTriggerScheduler] Processed trigger: ${trigger.name}`);
                } catch (error) {
                    loggerInstance.error(`[BehavioralTriggerScheduler] Error processing trigger ${trigger._id}:`, error);
                }
            }
        } catch (error) {
            loggerInstance.error('[BehavioralTriggerScheduler] Error during trigger check:', error);
        }
    });
    
    loggerInstance.log('[BehavioralTriggerScheduler] Behavioral trigger scheduler started. Checking triggers every 5 minutes.');
};

module.exports = { startBehavioralTriggerScheduler };