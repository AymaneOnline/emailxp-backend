require('dotenv').config();
const connectDB = require('./config/db');
const DomainAuthentication = require('./models/DomainAuthentication');

const id = process.argv[2];
if (!id) {
  console.error('Usage: node tmp-delete-domain.js <domainId>');
  process.exit(1);
}

(async () => {
  try {
    await connectDB();
    const doc = await DomainAuthentication.findById(id).lean();
    if (!doc) {
      console.error('Domain not found', id);
      process.exit(1);
    }
    await DomainAuthentication.findByIdAndDelete(id);
    console.log('Deleted domain', id, doc.domain);
    process.exit(0);
  } catch (e) {
    console.error('Error deleting domain', e);
    process.exit(1);
  }
})();
