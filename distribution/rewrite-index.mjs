import fs from 'node:fs/promises';
import path from 'node:path';
const [source, destination] = process.argv.slice(2);
if (!source || !destination) throw new Error('usage: rewrite-index.mjs source destination');
const doc = JSON.parse(await fs.readFile(source, 'utf8'));
  doc.files = (doc.files || []).filter(file => String(file.relativePath || '').replaceAll('\\', '/').startsWith('course-notes/'));
const portable = value => {
  if (Array.isArray(value)) return value.map(portable);
  if (!value || typeof value !== 'object') return typeof value === 'string' && /^[A-Za-z]:[\\/]/.test(value) ? '' : value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === 'visualReviewSource' || key === 'reviewFile') continue;
    out[key] = portable(item);
  }
  return out;
};
const clean = portable(doc);
Object.keys(doc).forEach(key => delete doc[key]);
Object.assign(doc, clean);
doc.folder = '.';
for (const file of doc.files || []) {
  const rel = String(file.relativePath || file.canonicalRelativePath || path.basename(file.path || ''))
    .replaceAll('\\', '/').replace(/^\.\//, '');
  const name = path.basename(rel);
  file.relativePath = rel.includes('/') && rel.split('/')[0] === 'course-notes' ? rel : `course-notes/${name}`;
  file.path = file.relativePath;
  file.canonicalRelativePath = name;
}
await fs.writeFile(destination, JSON.stringify(doc));
