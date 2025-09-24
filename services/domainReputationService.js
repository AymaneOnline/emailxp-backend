const DomainReputation = require('../models/DomainReputation');
const DomainAuthentication = require('../models/DomainAuthentication');

function floorToHour(date = new Date()) { const d = new Date(date); d.setMinutes(0,0,0); return d; }
function floorToDay(date = new Date()) { const d = new Date(date); d.setUTCHours(0,0,0,0); return d; }

async function getDomainOwner(domain) {
  const auth = await DomainAuthentication.findOne({ domain }).select('user organization');
  return auth ? auth.user : null;
}

async function incr(domain, field, amount = 1) {
  if (!domain) return;
  const user = await getDomainOwner(domain);
  const hourKey = floorToHour();
  const dayKey = floorToDay();
  const updates = { $inc: { [field]: amount }, $set: { lastEventAt: new Date(), user } };
  await DomainReputation.updateOne({ domain, windowType: 'hour', windowStart: hourKey }, updates, { upsert: true });
  await DomainReputation.updateOne({ domain, windowType: 'day', windowStart: dayKey }, updates, { upsert: true });
}

module.exports = {
  recordSend: (domain) => incr(domain, 'sends'),
  recordDelivered: (domain) => incr(domain, 'delivered'),
  recordBounce: (domain) => incr(domain, 'bounces'),
  recordComplaint: (domain) => incr(domain, 'complaints'),
  recordOpen: (domain) => incr(domain, 'opens'),
  recordClick: (domain) => incr(domain, 'clicks')
};
