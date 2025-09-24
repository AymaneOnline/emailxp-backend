// Utility functions for website URL normalization and validation
// Focus: ensure consistent storage for user.website / organization.website

const MAX_LENGTH = 2048;

function normalizeWebsite(raw) {
  if (raw === undefined || raw === null) return undefined; // no change
  let value = String(raw).trim();
  if (value === '') return ''; // explicit clear
  if (value.length > MAX_LENGTH) {
    throw new Error('Website URL is too long (max 2048 characters)');
  }
  // Prepend scheme if missing
  if (!/^https?:\/\//i.test(value)) {
    value = 'https://' + value;
  }
  let url;
  try {
    url = new URL(value);
  } catch (e) {
    throw new Error('Invalid website URL');
  }
  if (!/^https?:$/i.test(url.protocol)) {
    throw new Error('Website URL must use http or https');
  }
  // Normalize host lowercase
  url.hostname = url.hostname.toLowerCase();
  // Remove default ports
  if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) {
    url.port = '';
  }
  // Strip trailing slash from pathname (except root)
  if (url.pathname !== '/' && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.replace(/\/+$/, '');
    if (url.pathname === '') url.pathname = '/';
  }
  // Remove hash (not useful for canonical site)
  url.hash = '';
  // Keep query if any (rare for base site; could also strip) – choose to strip for consistency
  url.search = '';
  return url.toString();
}

module.exports = { normalizeWebsite };
