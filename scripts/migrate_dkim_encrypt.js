#!/usr/bin/env node
/*
  migrate_dkim_encrypt.js

  Idempotent migration to encrypt existing plaintext DKIM private keys in the
  DomainAuthentication collection. By default the script runs in dry-run mode
  and only reports candidates. To actually perform the migration pass --apply
  and ensure DKIM_KEY_ENC_KEY is set in the environment.

  Usage:
    node migrate_dkim_encrypt.js         # dry-run
    node migrate_dkim_encrypt.js --apply # perform encryption

  Notes:
  - The script detects plaintext keys by looking for PEM headers like
    'BEGIN PRIVATE KEY' or 'BEGIN RSA PRIVATE KEY'. This avoids false
    positives for already-encrypted blobs.
  - For safety the script does NOT write plaintext keys to disk.
  - Requires MONGO_URI and, when using --apply, DKIM_KEY_ENC_KEY.
*/

require('dotenv').config();
const connectDB = require('../config/db');
const DomainAuth = require('../models/DomainAuthentication');
const { encrypt } = require('../utils/crypto');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');

async function run() {
  if (APPLY && !process.env.DKIM_KEY_ENC_KEY) {
    console.error('ERROR: DKIM_KEY_ENC_KEY must be set when running with --apply');
    process.exit(2);
  }

  if (!process.env.MONGO_URI) {
    console.error('ERROR: MONGO_URI must be set in the environment or .env');
    process.exit(2);
  }

  console.log(`Connecting to MongoDB (${APPLY ? 'apply' : 'dry-run'})...`);
  await connectDB();

  // Find docs where dkim.privateKey looks like a PEM private key
  const pemRegex = /BEGIN (RSA )?PRIVATE KEY/;
  const candidates = await DomainAuth.find({ 'dkim.privateKey': { $regex: pemRegex } }).select('+dkim.privateKey domain');

  if (!candidates || candidates.length === 0) {
    console.log('No plaintext DKIM private keys found. Nothing to do.');
    process.exit(0);
  }

  console.log(`Found ${candidates.length} document(s) with plaintext DKIM private keys:`);
  for (const doc of candidates) {
    const domain = doc.domain || '(unknown)';
    const pk = doc.dkim && doc.dkim.privateKey ? doc.dkim.privateKey : null;
    const len = pk ? pk.length : 0;
    console.log(` - ${domain} (privateKey length=${len})`);
  }

  if (!APPLY) {
    console.log('\nDry-run complete. Re-run with --apply to encrypt these keys in-place.');
    process.exit(0);
  }

  console.log('\nApplying encryption to candidate documents...');
  let succeeded = 0;
  let failed = 0;

  for (const doc of candidates) {
    const domain = doc.domain || '(unknown)';
    try {
      if (!doc.dkim || !doc.dkim.privateKey) {
        console.warn(`Skipping ${domain}: no privateKey field`);
        continue;
      }
      // Double-check we still have a PEM header (avoid encrypting something else)
      if (!pemRegex.test(doc.dkim.privateKey)) {
        console.warn(`Skipping ${domain}: privateKey no longer looks like plaintext`);
        continue;
      }

      const encrypted = encrypt(doc.dkim.privateKey);
      // write encrypted value and update timestamp
      doc.dkim.privateKey = encrypted;
      await doc.save();
      console.log(`Encrypted key for ${domain}`);
      succeeded++;
    } catch (err) {
      console.error(`Failed to encrypt for ${domain}: ${err && err.message}`);
      failed++;
    }
  }

  console.log(`\nDone. succeeded=${succeeded}, failed=${failed}`);
  process.exit(failed ? 3 : 0);
}

run().catch(err => {
  console.error('Migration failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
