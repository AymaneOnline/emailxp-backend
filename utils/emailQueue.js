// Simple in-memory email job queue for development/small scale use
const queue = [];
let isProcessing = false;

function addEmailJob(job) {
  queue.push(job);
  processQueue();
}

async function processQueue() {
  if (isProcessing || queue.length === 0) return;
  isProcessing = true;
  while (queue.length > 0) {
    const job = queue.shift();
    try {
      await job();
      console.log('[EmailQueue] Email job processed successfully.');
    } catch (err) {
      console.error('[EmailQueue] Email job failed:', err);
    }
  }
  isProcessing = false;
}

function startEmailWorker() {
  // No-op for in-memory queue, but could be used for future expansion
  console.log('[EmailQueue] Worker started.');
}

module.exports = { addEmailJob, startEmailWorker };

