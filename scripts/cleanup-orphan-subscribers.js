const mongoose = require('mongoose');
const User = require('../models/User');
const Group = require('../models/Group');
const Subscriber = require('../models/Subscriber');

async function run() {
  // Allow overriding the Mongo URI via --uri or use process.env.MONGO_URI
  const uriArgIndex = process.argv.findIndex(a => a === '--uri');
  const uri = uriArgIndex !== -1 ? process.argv[uriArgIndex + 1] : process.env.MONGO_URI;
  if (!uri) {
    console.error('Error: MongoDB URI not provided. Use --uri or set MONGO_URI in env.');
    process.exit(1);
  }
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 30000,
      connectTimeoutMS: 30000,
      maxPoolSize: 10,
      minPoolSize: 1,
    });
    console.log('MongoDB Connected for cleanup');
  } catch (e) {
    console.error('MongoDB connection failed:', e.message);
    process.exit(1);
  }
  console.log('Cleaning orphan subscribers and duplicates...');

  const users = await User.find({}, '_id').lean();
  const userIds = new Set(users.map(u => String(u._id)));

  const groups = await Group.find({}, '_id').lean();
  const groupIds = new Set(groups.map(g => String(g._id)));

  const subs = await Subscriber.find({}, '_id user groups email').lean();

  // 1) Remove subscribers referencing deleted users
  const orphanByUser = subs.filter(s => s.user && !userIds.has(String(s.user))).map(s => s._id);
  if (orphanByUser.length) {
    console.log('Removing', orphanByUser.length, 'subscribers referencing deleted users');
    await Subscriber.deleteMany({ _id: { $in: orphanByUser } });
  }

  // 2) Remove subscribers referencing deleted groups (if subscribers reference groups)
  const orphanByGroup = subs.filter(s => Array.isArray(s.groups) && s.groups.some(g => g && !groupIds.has(String(g)))).map(s => s._id);
  if (orphanByGroup.length) {
    console.log('Removing', orphanByGroup.length, 'subscribers referencing deleted groups');
    await Subscriber.deleteMany({ _id: { $in: orphanByGroup } });
  }

  // 3) Remove duplicates keeping earliest per (email, user)
  const dupGroups = await Subscriber.aggregate([
    { $group: { _id: { email: '$email', user: '$user' }, ids: { $push: '$_id' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } }
  ]);

  let removed = 0;
  for (const g of dupGroups) {
    const ids = g.ids.map(id => mongoose.Types.ObjectId(id)).sort();
    const keep = ids.shift();
    if (ids.length) {
      const res = await Subscriber.deleteMany({ _id: { $in: ids } });
      removed += res.deletedCount || 0;
    }
  }
  console.log('Removed duplicate subscriber documents:', removed);

  console.log('Cleanup finished.');
  process.exit(0);
}

run().catch(err => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
