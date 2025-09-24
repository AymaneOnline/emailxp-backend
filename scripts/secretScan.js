#!/usr/bin/env node
/**
 * Lightweight secret scanner for EmailXP repo.
 * Usage: node scripts/secretScan.js [path]
 */
const fs = require('fs');
const path = require('path');

const startDir = process.argv[2] || path.join(__dirname, '..');

const IGNORE_DIRS = new Set(['node_modules', '.git', 'build', 'dist']);
const FILE_EXT_ALLOW = new Set(['.js', '.ts', '.json', '.env', '.yml', '.yaml', '.md']);

// High risk regex patterns
const PATTERNS = [
  { name: 'Generic API Key', regex: /api[_-]?key\s*=\s*["']?[A-Za-z0-9_\-]{20,}["']?/i },
  { name: 'Bearer Token', regex: /bearer\s+[A-Za-z0-9\-_.=]{20,}/i },
  { name: 'Resend Key', regex: /re_[A-Za-z0-9]{20,}/ },
  { name: 'Cloudinary Key', regex: /cloudinary.*[\"']?[0-9]{12,}[\"']?/i },
  { name: 'Private Key Block', regex: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/ },
  { name: 'Password in URI', regex: /mongodb(\+srv)?:\/\/[^\s:@]+:[^\s:@]+@/i },
  { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/ },
  { name: 'JWT Secret-like', regex: /jwt[_-]?secret\s*=\s*["']?[A-Za-z0-9!@#$%^&*()_+\-={}:";'<>?,.\/]{16,}["']?/i },
  { name: 'Mailgun Key', regex: /key-[0-9a-zA-Z]{32}/ },
  { name: 'SendGrid Key', regex: /SG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/ },
];

let findings = [];

function scanFile(filePath) {
  const ext = path.extname(filePath);
  if (ext && !FILE_EXT_ALLOW.has(ext)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  lines.forEach((line, idx) => {
    PATTERNS.forEach(p => {
      if (p.regex.test(line)) {
        findings.push({ file: path.relative(startDir, filePath), line: idx + 1, pattern: p.name, snippet: line.trim().slice(0, 160) });
      }
    });
  });
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (IGNORE_DIRS.has(e.name)) continue;
    const fullPath = path.join(dir, e.name);
    if (e.isDirectory()) {
      walk(fullPath);
    } else if (e.isFile()) {
      scanFile(fullPath);
    }
  }
}

walk(startDir);

if (findings.length === 0) {
  console.log('✅ No high-risk secret patterns detected.');
  process.exit(0);
}

console.log('⚠️ Potential secrets found:');
findings.forEach(f => {
  console.log(`- [${f.pattern}] ${f.file}:${f.line} -> ${f.snippet}`);
});
console.log('\nReview these lines and rotate any real secrets that were accidentally committed.');
process.exit(1);
