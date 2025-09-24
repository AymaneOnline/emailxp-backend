const Suppression = require('../models/Suppression');

class SuppressionService {
  async isSuppressed(email, organization = null) {
    if (!email) return false;
    const query = { email: email.toLowerCase(), type: { $in: ['unsubscribe','bounce','complaint','manual'] } };
    if (organization) query.organization = organization;
    const found = await Suppression.findOne(query).lean();
    return !!found;
  }

  async bulkFilter(emails, organization = null) {
    if (!emails?.length) return { suppressed: new Set(), list: [] };
    const normalized = emails.map(e => e.toLowerCase());
    const query = { email: { $in: normalized }, type: { $in: ['unsubscribe','bounce','complaint','manual'] } };
    if (organization) query.organization = organization;
    const list = await Suppression.find(query).lean();
    return { suppressed: new Set(list.map(d => d.email)), list };
  }

  async add({ email, type, reason, source = 'system', user, organization, meta }) {
    return Suppression.recordEvent({ email, type, reason, source, user, organization, meta });
  }

  async remove({ email, type, organization }) {
    const query = { email: email.toLowerCase(), type };
    if (organization) query.organization = organization;
    return Suppression.deleteOne(query);
  }
}

module.exports = new SuppressionService();
