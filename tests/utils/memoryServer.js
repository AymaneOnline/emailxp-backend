const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let mongo;

async function connect() {
  mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri();
  await mongoose.connect(uri, { dbName: 'test' });
}

async function cleanup() {
  const collections = await mongoose.connection.db.collections();
  for (const c of collections) {
    if (c.collectionName.startsWith('system.')) continue; // skip system collections
    await c.deleteMany({});
  }
}

async function disconnect() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
  if (mongo) await mongo.stop();
}

module.exports = { connect, cleanup, disconnect };
