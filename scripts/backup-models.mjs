#!/usr/bin/env node
/* Stream Ollama model stores into a GitHub-safe, content-addressed backup. */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';

const PART_SIZE = 1_900_000_000;
const PROGRESS_SIZE = 256 * 1024 * 1024;
const root = process.cwd();
const out = path.resolve(process.argv[2] || path.join(root, '.model-backup-release'));
const inputs = process.argv.slice(3).length ? process.argv.slice(3) : [
  process.env.USERPROFILE ? path.join(process.env.USERPROFILE, '.ollama', 'models') : path.join(process.env.HOME || '', '.ollama', 'models'),
  'G:\\闯哥\\OllamaModels'
];

const safeRel = p => p.replaceAll('\\', '/').replace(/^\/+/, '');
const isBlob = p => /^sha256-[0-9a-f]{64}$/i.test(path.basename(p));
const hashFile = async (file, writeParts) => {
  const hash = crypto.createHash('sha256'); let size = 0; let next = PROGRESS_SIZE;
  let part = 0, partBytes = 0, ws = null, names = [], digests = [], ph = null;
  const openPart = async () => { part++; partBytes = 0; const name = `part${String(part).padStart(3, '0')}.bin`; names.push(name); ws = fs.createWriteStream(path.join(writeParts, name)); ph = crypto.createHash('sha256'); };
  if (writeParts) { await fsp.mkdir(writeParts, { recursive: true }); await openPart(); }
  for await (const chunk of fs.createReadStream(file)) {
    hash.update(chunk); size += chunk.length;
    if (writeParts) {
      let off = 0;
      while (off < chunk.length) { const take = Math.min(chunk.length - off, PART_SIZE - partBytes); const slice = chunk.subarray(off, off + take); if (!ws.write(slice)) await new Promise(r => ws.once('drain', r)); ph.update(slice); partBytes += take; off += take; if (partBytes === PART_SIZE) { await new Promise((r, j) => ws.end(e => e ? j(e) : r())); digests.push(ph.digest('hex')); await openPart(); } }
    }
    if (size >= next) { console.log(`[backup] ${path.basename(file)}: ${(size / 2 ** 30).toFixed(2)} GiB`); next += PROGRESS_SIZE; }
  }
  if (writeParts) { await new Promise((r, j) => ws.end(e => e ? j(e) : r())); if (partBytes === 0) { await fsp.unlink(path.join(writeParts, names.pop())); part--; } else digests.push(ph.digest('hex')); }
  return { sha256: hash.digest('hex'), size, parts: names.map((name, i) => ({ name, size: i === names.length - 1 ? (size - PART_SIZE * i) : PART_SIZE, sha256: digests[i] })) };
};
const walk = async dir => { const result = []; if (!fs.existsSync(dir)) return result; for (const e of await fsp.readdir(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) result.push(...await walk(p)); else if (e.isFile()) result.push(p); } return result; };
await fsp.mkdir(path.join(out, 'blobs'), { recursive: true }); await fsp.mkdir(path.join(out, 'metadata'), { recursive: true });
const files = [], byHash = new Map(), sources = [];
for (let i = 0; i < inputs.length; i++) {
  const source = path.resolve(inputs[i]); const alias = `source-${String.fromCharCode(97 + i)}`; sources.push({ alias, root: alias });
  for (const file of await walk(source)) {
    const rel = safeRel(path.relative(source, file));
    if (!rel || rel.startsWith('idkeys') || rel.includes('/idkeys/')) continue;
    const blob = rel.startsWith('blobs/') && isBlob(file);
    if (blob) {
      const expected = path.basename(file).slice(7).toLowerCase(); const staged = path.join(out, 'blobs', `.staging-${alias}-${expected}`);
      const info = await hashFile(file, staged); if (info.sha256 !== expected) throw new Error(`hash mismatch in ${alias}/${rel}: filename ${expected}, content ${info.sha256}`);
      const existing = byHash.get(info.sha256);
      if (existing) { await fsp.rm(staged, { recursive: true, force: true }); } else { const finalDir = path.join(out, 'blobs', info.sha256); await fsp.rename(staged, finalDir); byHash.set(info.sha256, { ...info, dir: `blobs/${info.sha256}` }); }
      files.push({ source: alias, relativePath: rel, sha256: info.sha256, size: info.size, kind: 'blob' });
    } else {
      const info = await hashFile(file); const dest = path.join(out, 'metadata', alias, rel); await fsp.mkdir(path.dirname(dest), { recursive: true }); await fsp.copyFile(file, dest);
      files.push({ source: alias, relativePath: rel, sha256: info.sha256, size: info.size, kind: 'metadata', backupPath: `metadata/${alias}/${rel}` });
    }
  }
}
const manifest = { format: 1, createdAt: new Date().toISOString(), partSize: PART_SIZE, sources, files, blobs: [...byHash.values()].map(({ dir, ...x }) => ({ ...x, path: dir })) };
await fsp.writeFile(path.join(out, 'backup-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(`[backup] complete: ${files.length} source files, ${byHash.size} unique blobs, output ${out}`);
