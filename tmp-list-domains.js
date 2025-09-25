const mongoose = require('mongoose');
const connectDB = require('./config/db');
const DomainAuthentication = require('./models/DomainAuthentication');

(async () => {
  try {
    await connectDB();
    const domains = await DomainAuthentication.find({}).lean();
    console.log('Found', domains.length, 'domains');
    domains.forEach(d => console.log(d._id.toString(), d.domain, d.status));
    process.exit(0);
  } catch (e) {
    console.error('Error listing domains', e);
    process.exit(1);
  }
})();
