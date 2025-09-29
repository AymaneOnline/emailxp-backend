const EmailLog = require('../models/EmailLog');

function dateRange(days) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));
  return { start, end };
}

async function summary({ userId, days = 30 }) {
  const { start, end } = dateRange(days);
  const match = { createdAt: { $gte: start, $lte: end } };
  // If EmailLog holds user linkage indirectly through Campaign ownership only, skip user filter.
  const pipeline = [
    { $match: match },
    { $group: { _id: '$status', c: { $sum: 1 } } }
  ];
  const rows = await EmailLog.aggregate(pipeline);
  const base = {
    queued: 0, sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0, unsubscribed: 0, failed: 0
  };
  rows.forEach(r => { base[r._id] = r.c; });
  const attempted = base.queued + base.sent;
  const delivered = base.delivered;
  const metrics = {
    attempted,
    delivered,
    counts: base,
    deliveryRate: attempted ? (delivered / attempted) * 100 : 0,
    openRate: delivered ? (base.opened / delivered) * 100 : 0,
    clickRate: delivered ? (base.clicked / delivered) * 100 : 0,
    bounceRate: attempted ? (base.bounced / attempted) * 100 : 0,
    complaintRate: delivered ? (base.complained / delivered) * 100 : 0,
    unsubscribeRate: delivered ? (base.unsubscribed / delivered) * 100 : 0,
    timeWindow: { start, end }
  };
  return metrics;
}

async function trends({ userId, days = 14 }) {
  const { start, end } = dateRange(days);
  const pipeline = [
    { $match: { createdAt: { $gte: start, $lte: end } } },
    { $project: { day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, status: 1 } },
    { $group: { _id: { day: '$day', status: '$status' }, c: { $sum: 1 } } },
    { $group: { _id: '$_id.day', statuses: { $push: { status: '$_id.status', c: '$c' } } } },
    { $sort: { _id: 1 } }
  ];
  const rows = await EmailLog.aggregate(pipeline);
  // Build day list
  const daysArr = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    daysArr.push(d.toISOString().slice(0,10));
  }
  const perDay = daysArr.map(day => {
    const row = rows.find(r => r._id === day);
    const base = { day, queued:0,sent:0,delivered:0,opened:0,clicked:0,bounced:0,complained:0,unsubscribed:0,failed:0 };
    if (row) row.statuses.forEach(s=> base[s.status] = s.c);
    base.deliveryRate = (base.sent+base.queued) ? (base.delivered/(base.sent+base.queued))*100 : 0;
    base.openRate = base.delivered ? (base.opened/base.delivered)*100 : 0;
    base.clickRate = base.delivered ? (base.clicked/base.delivered)*100 : 0;
    return base;
  });
  return { range: { start, end }, days: perDay };
}

/**
 * Advanced insights:
 * - bounceReasons: [{reason,count,percent}]
 * - complaintReasons: [{reason,count,percent}]
 * - latency: { open: {p50,p75,p90,p95,p99}, click: {...} }
 * - funnel: { attempted, delivered, opened, clicked, deliveredDropPct, openDropPct, clickThroughFromDeliveredPct }
 * - responsivenessBuckets: time-to-open distribution
 */
async function getInsights({ days = 30 }) {
  const { start, end } = dateRange(days);
  const matchWindow = { createdAt: { $gte: start, $lte: end } };

  // Base counts for funnel
  const statusGroup = await EmailLog.aggregate([
    { $match: matchWindow },
    { $group: { _id: '$status', c: { $sum: 1 } } }
  ]);
  const counts = statusGroup.reduce((acc,r)=>{ acc[r._id]=r.c; return acc; }, {});
  const attempted = (counts.queued||0)+(counts.sent||0);
  // Treat emails that progressed to opened/clicked as inherently delivered.
  const delivered = (counts.delivered||0) + (counts.opened||0) + (counts.clicked||0);
  const opened = counts.opened||0;
  const clicked = counts.clicked||0;

  function pct(a,b){ return b? (a/b)*100:0; }
  const funnel = {
    attempted, delivered, opened, clicked,
    deliveryRate: pct(delivered, attempted),
    openRateFromDelivered: pct(opened, delivered),
    clickRateFromDelivered: pct(clicked, delivered),
    clickRateFromOpened: pct(clicked, opened),
    deliveredDropPct: attempted? (1 - delivered/attempted)*100:0,
    openDropPct: delivered? (1 - opened/delivered)*100:0
  };

  // Bounce / complaint reasons breakdown (top 5 each; rest grouped as other)
  const reasonPipeline = (field, statusField) => [
    { $match: { ...matchWindow, [statusField]: { $ne: null } } },
    { $group: { _id: `$${field}`, c: { $sum: 1 } } },
    { $sort: { c: -1 } }
  ];

  const bounceRaw = await EmailLog.aggregate(reasonPipeline('bounceReason','bouncedAt'));
  const complaintRaw = await EmailLog.aggregate(reasonPipeline('complaintReason','complainedAt'));
  function topList(raw){
    if(!raw.length) return { list: [], total:0 };
    const total = raw.reduce((s,r)=>s+r.c,0);
    const top = raw.slice(0,5);
    const otherCount = raw.slice(5).reduce((s,r)=>s+r.c,0);
    const list = top.map(r=>({ reason: r._id||'unknown', count:r.c, percent: pct(r.c,total) }));
    if(otherCount>0) list.push({ reason:'other', count:otherCount, percent: pct(otherCount,total) });
    return { list, total };
  }
  const bounceReasons = topList(bounceRaw);
  const complaintReasons = topList(complaintRaw);

  // Latency percentiles (open & click) – compute in JS after fetching durations (capped sample if huge)
  const latencyDocs = await EmailLog.aggregate([
    { $match: { ...matchWindow, sentAt: { $ne: null }, $or: [{ openedAt: { $ne: null } }, { clickedAt: { $ne: null } }] } },
    { $project: {
        openLatencyMs: { $cond: [{ $and: ['$openedAt','$sentAt'] }, { $subtract: ['$openedAt','$sentAt'] }, null] },
        clickLatencyMs:{ $cond: [{ $and: ['$clickedAt','$sentAt'] }, { $subtract: ['$clickedAt','$sentAt'] }, null] }
    } }
  ]);

  function computePercentiles(values){
    if(!values.length) return { p50:0,p75:0,p90:0,p95:0,p99:0 };
    const sorted = values.sort((a,b)=>a-b);
    const pick = p => sorted[Math.min(sorted.length-1, Math.floor(p*sorted.length))];
    return { p50: pick(0.50), p75: pick(0.75), p90: pick(0.90), p95: pick(0.95), p99: pick(0.99) };
  }
  // Exclude entries that also have click latency from open-latency bucket to avoid
  // double-counting (a clicked record may include an openedAt timestamp but is
  // treated as 'clicked' in the funnel counts). Keep click latencies intact for
  // click percentile calculations.
  const openLatencies = latencyDocs.filter(d => d.openLatencyMs != null && d.clickLatencyMs == null).map(d => d.openLatencyMs);
  const clickLatencies = latencyDocs.filter(d => d.clickLatencyMs != null).map(d => d.clickLatencyMs);
  const latency = {
    open: computePercentiles(openLatencies),
    click: computePercentiles(clickLatencies)
  };

  // Responsiveness buckets (time-to-open)
  const buckets = [
    { key:'lt1m', label:'<1m', max:60_000 },
    { key:'1to5m', label:'1-5m', max:5*60_000 },
    { key:'5to30m', label:'5-30m', max:30*60_000 },
    { key:'30mto2h', label:'30m-2h', max:2*60*60_000 },
    { key:'gt2h', label:'>2h', max:Infinity }
  ];
  const bucketCounts = { lt1m:0, '1to5m':0, '5to30m':0, '30mto2h':0, gt2h:0, neverOpened:0 };
  openLatencies.forEach(ms=>{
    for(const b of buckets){
      if(ms < b.max){ bucketCounts[b.key]++; break; }
    }
  });
  const unopened = delivered - opened;
  if (unopened>0) bucketCounts.neverOpened = unopened;
  const responsivenessBuckets = Object.entries(bucketCounts).map(([k,v])=>({ bucket:k, count:v, percent: pct(v, delivered||1) }));

  return {
    timeWindow:{ start, end },
    funnel,
    bounceReasons: bounceReasons.list,
    complaintReasons: complaintReasons.list,
    latency,
    responsiveness: responsivenessBuckets
  };
}

module.exports = { summary, trends, getInsights };
