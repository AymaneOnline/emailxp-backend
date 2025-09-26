DKIM private key migration
==========================

This folder contains a safe, idempotent migration script to encrypt existing
DKIM private keys stored in the `DomainAuthentication.dkim.privateKey` field.

Why
---
Previously DKIM private keys were stored as plaintext PEM in the database. The
migration encrypts those values using AES-256-GCM and the `DKIM_KEY_ENC_KEY`
environment variable so keys are not stored in clear text at rest.

Usage
-----
1. Dry run (lists candidate documents):

   node migrate_dkim_encrypt.js

2. Apply (encrypts keys in-place):

   export DKIM_KEY_ENC_KEY=<your-32byte-hex-or-base64-or-passphrase>
   export MONGO_URI=<your-mongo-uri>
   node migrate_dkim_encrypt.js --apply

Notes
-----
- The script detects plaintext PEM keys by searching for `BEGIN PRIVATE KEY`
  markers; records that don't match are skipped.
- Keep a backup before running the migration in production.
- For production-grade security consider integrating a managed KMS and
  optionally rotating encryption keys.
