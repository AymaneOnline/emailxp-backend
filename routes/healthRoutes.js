const express = require('express');
const router = express.Router();
const { getQueueStats, getQueueMode } = require('../services/queueServiceWrapper');

router.get('/queue', async (req, res) => {
  try {
    const stats = await getQueueStats();
    const modeInfo = getQueueMode();
    res.json({
      queue: {
        mode: modeInfo.mode,
        lastError: modeInfo.lastError,
        initializedAt: modeInfo.initializedAt,
        stats,
        uptimeSeconds: (Date.now() - new Date(modeInfo.initializedAt).getTime()) / 1000,
        timestamp: modeInfo.timestamp
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve queue health', details: err.message });
  }
});

module.exports = router;
