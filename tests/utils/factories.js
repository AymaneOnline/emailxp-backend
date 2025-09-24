const mongoose = require('mongoose');
const EmailLog = require('../../models/EmailLog');

function objectId() { return new mongoose.Types.ObjectId(); }

async function createEmailLog(overrides = {}) {
  const now = new Date();
  const base = {
    campaignId: objectId(),
    subscriberId: objectId(),
    email: `user${Math.random().toString(16).slice(2)}@example.com`,
    subject: 'Test',
    status: 'sent'
  };
  const doc = new EmailLog({ ...base, ...overrides });
  return doc.save();
}

async function seedScenario() {
  const sentTime = new Date(Date.now() - 1000 * 60 * 60); // 1h ago
  const campaign = objectId();

  // Baseline attempted emails (queued & sent) before other states
  await createEmailLog({ campaignId: campaign, subscriberId: objectId(), status: 'queued' });
  await createEmailLog({ campaignId: campaign, subscriberId: objectId(), status: 'sent', sentAt: sentTime });

  // Delivered + opened with various latencies
  const openLatenciesMs = [30_000, 90_000, 6*60_000, 40*60_000, 3*60*60_000];
  for (const ms of openLatenciesMs) {
    await createEmailLog({
      campaignId: campaign,
      subscriberId: objectId(),
      status: 'opened',
      sentAt: sentTime,
      deliveredAt: new Date(sentTime.getTime() + 5_000),
      openedAt: new Date(sentTime.getTime() + ms)
    });
  }

  // Clicked subset
  await createEmailLog({
    campaignId: campaign,
    subscriberId: objectId(),
    status: 'clicked',
    sentAt: sentTime,
    deliveredAt: new Date(sentTime.getTime() + 4_000),
    openedAt: new Date(sentTime.getTime() + 50_000),
    clickedAt: new Date(sentTime.getTime() + 120_000)
  });

  // Bounced with reasons
  await createEmailLog({ campaignId: campaign, subscriberId: objectId(), status: 'bounced', bounceReason: 'mailbox_full', bouncedAt: new Date() });
  await createEmailLog({ campaignId: campaign, subscriberId: objectId(), status: 'bounced', bounceReason: 'blocked', bouncedAt: new Date() });
  await createEmailLog({ campaignId: campaign, subscriberId: objectId(), status: 'bounced', bounceReason: 'mailbox_full', bouncedAt: new Date() });

  // Complaints
  await createEmailLog({ campaignId: campaign, subscriberId: objectId(), status: 'complained', complaintReason: 'abuse', complainedAt: new Date() });

  // Delivered but never opened
  for (let i=0;i<3;i++) {
    await createEmailLog({ campaignId: campaign, subscriberId: objectId(), status: 'delivered', sentAt: sentTime, deliveredAt: new Date(sentTime.getTime() + 3_000) });
  }

  // Queued + Sent (attempted but not delivered)
  await createEmailLog({ campaignId: campaign, subscriberId: objectId(), status: 'queued' });
  await createEmailLog({ campaignId: campaign, subscriberId: objectId(), status: 'sent', sentAt: new Date() });

  return { campaign };
}

module.exports = { createEmailLog, seedScenario };
