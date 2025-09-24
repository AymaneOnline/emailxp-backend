const mongoose = require('mongoose');
const logger = require('../utils/logger');

async function auditIndexes() {
  const conn = mongoose.connection;
  const collections = await conn.db.listCollections().toArray();
  for (const meta of collections) {
    const name = meta.name;
    try {
      const idx = await conn.db.collection(name).indexes();
      logger.info({ collection: name, indexes: idx }, 'Index audit');
      // Detect duplicates (same key pattern appearing multiple times)
      const patterns = new Map();
      for (const i of idx) {
        const keyStr = JSON.stringify(i.key);
        if (!patterns.has(keyStr)) patterns.set(keyStr, []);
        patterns.get(keyStr).push(i.name);
      }
      for (const [keyStr, names] of patterns.entries()) {
        if (names.length > 1) {
          logger.warn({ collection: name, key: keyStr, names }, 'Duplicate index pattern detected');
        }
      }
    } catch (e) {
      logger.error({ collection: name, err: e.message }, 'Failed index audit');
    }
  }
}

module.exports = { auditIndexes };
