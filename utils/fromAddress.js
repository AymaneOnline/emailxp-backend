const DomainAuthentication = require('../models/DomainAuthentication');
const User = require('../models/User');

async function getPrimaryVerifiedDomain(userId) {
  const domain = await DomainAuthentication.findOne({ user: userId, status: 'verified', isPrimary: true });
  if (domain) return domain.domain;
  // fallback: any verified domain for user
  const any = await DomainAuthentication.findOne({ user: userId, status: 'verified' });
  return any ? any.domain : null;
}

async function buildFromAddress(userId) {
  const user = await User.findById(userId).lean();
  if (!user) throw new Error('User not found');
  const domain = await getPrimaryVerifiedDomain(userId);
  if (!domain) {
    throw new Error('No verified sending domain');
  }
  const display = user.companyOrOrganization || user.name || 'User';
  const email = `no-reply@${domain}`;
  return { from: `${display} <${email}>`, email, domain };
}

module.exports = { buildFromAddress, getPrimaryVerifiedDomain };
