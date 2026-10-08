import fs from 'node:fs/promises';
import path from 'node:path';
const [source, destination] = process.argv.slice(2);
if (!source || !destination) throw new Error('usage: rewrite-index.mjs source destination');
const doc = JSON.parse(await fs.readFile(source, 'utf8'));
doc.files = (doc.files || []).filter(file => String(file.relativePath || '').replaceAll('\\', '/').startsWith('笔记版课件/'));
doc.folder = '.';
for (const file of doc.files || []) {
  const rel = String(file.relativePath || file.canonicalRelativePath || path.basename(file.path || ''))
    .replaceAll('\\', '/').replace(/^\.\//, '');
  const name = path.basename(rel);
  file.relativePath = rel.includes('/') && rel.split('/')[0] === '笔记版课件' ? rel : `笔记版课件/${name}`;
  file.path = file.relativePath;
  file.canonicalRelativePath = name;
}
await fs.writeFile(destination, JSON.stringify(doc));
