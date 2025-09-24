const Subscriber = require('../models/Subscriber');
const Segment = require('../models/Segment');
const mongoose = require('mongoose');

// Build Mongo query fragments for given segment ids by calling segment.buildQuery()
async function buildSegmentQueries(segmentIds) {
  if (!segmentIds || !segmentIds.length) return [];
  const segments = await Segment.find({ _id: { $in: segmentIds } });
  const queries = [];
  for (const seg of segments) {
    try {
      const q = seg.buildQuery();
      if (q && Object.keys(q).length) queries.push(q);
    } catch (e) {
      console.error('Failed to build segment query for', seg._id, e.message);
    }
  }
  return queries;
}

// Efficient estimate using a single aggregation on Subscriber collection
exports.estimate = async (req, res) => {
  try {
    const userId = req.user && req.user._id ? new mongoose.Types.ObjectId(req.user._id) : null;
    const { groups = [], segments = [], subscribers = [] } = req.body || {};

    const orConditions = [];
    if (subscribers && subscribers.length) {
      orConditions.push({ _id: { $in: subscribers.map(id => new mongoose.Types.ObjectId(id)) } });
    }
    if (groups && groups.length) {
      orConditions.push({ groups: { $in: groups.map(id => new mongoose.Types.ObjectId(id)) } });
    }

    const segQueries = await buildSegmentQueries(segments);
    if (segQueries.length) {
      orConditions.push(...segQueries);
    }

    if (!orConditions.length) return res.json({ total: 0 });

    const match = { user: userId, isDeleted: false, $or: orConditions };

    const pipeline = [
      { $match: match },
      { $group: { _id: null, ids: { $addToSet: '$_id' } } },
      { $project: { total: { $size: '$ids' } } }
    ];

    const out = await Subscriber.aggregate(pipeline).allowDiskUse(true).exec();
    const total = (out && out[0] && out[0].total) ? out[0].total : 0;
    return res.json({ total });
  } catch (err) {
    console.error('Audience estimate failed', err);
    return res.status(500).json({ error: 'Failed to estimate audience' });
  }
};

// Sample endpoint: returns deduped total and a sample of subscribers
exports.sample = async (req, res) => {
  try {
    const userId = req.user && req.user._id ? new mongoose.Types.ObjectId(req.user._id) : null;
    const { groups = [], segments = [], subscribers = [], limit = 10 } = req.body || {};

    const orConditions = [];
    if (subscribers && subscribers.length) {
      orConditions.push({ _id: { $in: subscribers.map(id => new mongoose.Types.ObjectId(id)) } });
    }
    if (groups && groups.length) {
      orConditions.push({ groups: { $in: groups.map(id => new mongoose.Types.ObjectId(id)) } });
    }

    const segQueries = await buildSegmentQueries(segments);
    if (segQueries.length) {
      orConditions.push(...segQueries);
    }

    if (!orConditions.length) return res.json({ total: 0, sample: [] });

    const match = { user: userId, isDeleted: false, $or: orConditions };

    const pipeline = [
      { $match: match },
      { $group: { _id: null, ids: { $addToSet: '$_id' } } },
      { $project: { total: { $size: '$ids' }, sampleIds: { $slice: ['$ids', limit] } } }
    ];

    const out = await Subscriber.aggregate(pipeline).allowDiskUse(true).exec();
    const total = (out && out[0] && out[0].total) ? out[0].total : 0;
    const sampleIds = (out && out[0] && out[0].sampleIds) ? out[0].sampleIds : [];

    const sampleDocs = sampleIds.length ? await Subscriber.find({ _id: { $in: sampleIds } }).select('email firstName lastName').lean() : [];
    return res.json({ total, sample: sampleDocs });
  } catch (err) {
    console.error('Audience sample failed', err);
    return res.status(500).json({ error: 'Failed to fetch audience sample' });
  }
};
