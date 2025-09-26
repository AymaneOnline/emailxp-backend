const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const IV_LEN = 12; // recommended for GCM

function getKey() {
  const k = process.env.DKIM_KEY_ENC_KEY;
  if (!k) throw new Error('DKIM_KEY_ENC_KEY not set');
  // Expect a base64 or hex string; accept raw passphrase by deriving
  if (k.length === 44 || k.endsWith('=')) return Buffer.from(k, 'base64');
  if (/^[0-9a-fA-F]+$/.test(k) && k.length === 64) return Buffer.from(k, 'hex');
  // Derive a 32-byte key from passphrase
  return crypto.createHash('sha256').update(k).digest();
}

function encrypt(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decrypt(ciphertext) {
  const key = getKey();
  const raw = Buffer.from(ciphertext, 'base64');
  const iv = raw.slice(0, IV_LEN);
  const tag = raw.slice(IV_LEN, IV_LEN + 16);
  const encrypted = raw.slice(IV_LEN + 16);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

module.exports = { encrypt, decrypt };
