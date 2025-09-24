const { normalizeWebsite } = require('../utils/website');

describe('normalizeWebsite', () => {
  test('returns empty string when cleared', () => {
    expect(normalizeWebsite('')).toBe('');
  });
  test('adds https scheme if missing', () => {
    expect(normalizeWebsite('Example.com')).toBe('https://example.com/');
  });
  test('keeps https and lowercases host', () => {
    expect(normalizeWebsite('https://EXAMPLE.com/Path/')).toBe('https://example.com/Path');
  });
  test('rejects invalid url', () => {
    expect(() => normalizeWebsite('ht!tp://bad')).toThrow(/Invalid website URL/);
  });
  test('rejects unsupported scheme', () => {
    expect(() => normalizeWebsite('ftp://example.com')).toThrow(/must use http or https/);
  });
  test('strips hash and query', () => {
    expect(normalizeWebsite('https://example.com/path/?a=1#section')).toBe('https://example.com/path');
  });
});
