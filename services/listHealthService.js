const Subscriber = require('../models/Subscriber');
const EmailLog = require('../models/EmailLog');

module.exports = {
  async getListHealth({ userId, days = 30 }) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Base counts (excluding deleted)
    const statusPipeline = [
      { $match: { user: userId, isDeleted: false } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ];
    const statusRows = await Subscriber.aggregate(statusPipeline);
    const statusCounts = statusRows.reduce((acc,r)=>{ acc[r._id] = r.count; return acc; }, {});

    // Growth (new subscribers in window)
    const newSubs = await Subscriber.countDocuments({ user: userId, createdAt: { $gte: since }, isDeleted: false });
    const unsubscribes = await Subscriber.countDocuments({ user: userId, unsubscribedAt: { $gte: since } });

    // Inactivity buckets by lastActivityAt
    const now = new Date();
    function daysAgo(n){ const d = new Date(now); d.setDate(d.getDate()-n); return d; }
    // Non-overlapping inactivity ranges in days: 0-30,31-60,61-90,91-180,>180
    const inactivity = {};
    async function countRange(minDays, maxDays){
      const minDate = minDays != null ? daysAgo(minDays) : null; // older than minDays
      const maxDate = maxDays != null ? daysAgo(maxDays) : null; // more recent than maxDays
      const criteria = { user: userId, isDeleted:false };
      if(minDate) criteria.lastActivityAt = { ...(criteria.lastActivityAt||{}), $lt: minDate };
      if(maxDate) criteria.lastActivityAt = { ...(criteria.lastActivityAt||{}), $gte: maxDate };
      return Subscriber.countDocuments(criteria);
    }
    inactivity['0-30'] = await countRange(null,30); // >= now-30d
    inactivity['31-60'] = await countRange(30,60);
    inactivity['61-90'] = await countRange(60,90);
    inactivity['91-180'] = await countRange(90,180);
    inactivity['>180'] = await countRange(180,null);

    // Bounce & complaint composition via status and EmailLog events (fallback to status if logs absent)
    const bounced = statusCounts['bounced'] || 0;
    const complained = statusCounts['complained'] || 0;

    // Simple health score heuristic
    const total = Object.values(statusCounts).reduce((a,b)=>a+b,0) || 1;
    const activeLike = (statusCounts['subscribed']||0);
    const churnLike = (statusCounts['unsubscribed']||0) + complained + bounced;
    const engagementFactor = Math.max(0, 1 - (churnLike/total));
  const longDormant = (inactivity['91-180']||0) + (inactivity['>180']||0);
  const inactivityPenalty = Math.min(0.3, (longDormant/total) * 0.3);
    const healthScore = Number(((engagementFactor - inactivityPenalty) * 100).toFixed(2));

    return {
      timeframeDays: days,
      counts: statusCounts,
      growth: { new: newSubs, unsubscribed: unsubscribes, net: newSubs - unsubscribes },
      inactivityBuckets: inactivity,
      quality: { bounced, complained },
      healthScore,
      meta: { generatedAt: new Date() }
    };
  }
};
