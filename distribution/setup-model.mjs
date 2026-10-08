#!/usr/bin/env node
/* GitHub-release-only model installer. Streams each flat part once into a
   package-local blob, verifies part and full SHA-256, and never overwrites a
   different existing file. */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const cfg = JSON.parse(await fsp.readFile(path.join(root, 'model-release.json'), 'utf8'));
const target = path.join(root, 'data', 'models');
const allowed = new Set(['api.github.com', 'github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com']);
const safeUrl = raw => { const u = new URL(raw); if (u.protocol !== 'https:' || !allowed.has(u.hostname)) throw new Error(`refusing non-GitHub URL: ${u.hostname}`); return u; };
const request = async raw => {
  let u = safeUrl(raw);
  for (let hop = 0; hop < 8; hop++) {
    const r = await fetch(u, { headers: { 'User-Agent': 'ME5412-portable-model-setup/1', Accept: 'application/vnd.github+json' }, redirect: 'manual' });
    if (r.status >= 300 && r.status < 400) {
      const location = r.headers.get('location'); if (!location) throw new Error(`redirect without location from ${u}`);
      u = safeUrl(new URL(location, u).toString()); continue;
    }
    if (!r.ok) throw new Error(`${r.status} ${u}`);
    return r;
  }
  throw new Error('too many GitHub redirects');
};
const digest = async file => { const h = crypto.createHash('sha256'); let size = 0; for await (const c of fs.createReadStream(file)) { h.update(c); size += c.length; } return { sha256: h.digest('hex'), size }; };
const check = async (file, expected, label) => { const got = await digest(file); if (got.sha256 !== expected.sha256 || got.size !== Number(expected.size)) throw new Error(`${label} verification failed: ${got.sha256}/${got.size}`); };
const manifestPath = process.argv[2];
let release = cfg;
if (manifestPath) release = JSON.parse(await fsp.readFile(path.resolve(manifestPath), 'utf8'));
const apiUrl = release.releaseApi || cfg.releaseApi;
const apiResponse = await request(apiUrl);
const releaseInfo = await apiResponse.json();
const assets = new Map((releaseInfo.assets || []).map(a => [a.name, a.browser_download_url]));
const names = release.manifestAssetNames || cfg.manifestAssetNames;
const manifestName = names.find(n => assets.has(n));
if (!manifestName) throw new Error(`release has no manifest asset (${names.join(', ')})`);
const manifestResponse = await request(assets.get(manifestName));
const manifest = await manifestResponse.json();
await fsp.mkdir(target, { recursive: true });
const files = new Map();
for (const f of manifest.files || []) { if (!f.relativePath || !f.sha256 || !Number.isInteger(Number(f.size))) continue; const old = files.get(f.relativePath); if (old && old.sha256 !== f.sha256) throw new Error(`conflicting manifest path: ${f.relativePath}`); files.set(f.relativePath, f); }
const blobs = new Map((manifest.blobs || []).map(b => [b.sha256, b]));
const assetFor = name => assets.get(name) || [...assets.entries()].find(([n]) => n.endsWith('/' + name))?.[1];
for (const [rel, f] of files) {
  const clean = rel.replaceAll('\\', '/'); if (clean.startsWith('/') || clean.includes('..') || /^[A-Za-z]:/.test(clean)) throw new Error(`unsafe model path: ${rel}`);
  const out = path.resolve(target, clean); if (!out.startsWith(target + path.sep)) throw new Error(`model path escapes target: ${rel}`);
  if (fs.existsSync(out)) { await check(out, f, `existing ${rel}`); continue; }
  const blob = blobs.get(f.sha256);
  await fsp.mkdir(path.dirname(out), { recursive: true }); const tmp = `${out}.portable-${process.pid}`; const ws = fs.createWriteStream(tmp); const full = crypto.createHash('sha256'); let total = 0;
  try {
    const metadataFlat = String(f.backupPath || rel).replaceAll('\\', '/').replace(/^metadata\//, '').replaceAll('/', '-');
    const parts = f.kind === 'metadata' ? [{ name: `metadata-${metadataFlat}`, sha256: f.sha256, size: f.size }] : (blob?.parts || []);
    if (!parts.length) throw new Error(`missing blob manifest: ${f.sha256}`);
    for (const part of parts) {
      const url = assetFor(f.kind === 'metadata' ? `model-${part.name}` : `model-${blob.sha256}-${part.name}`); if (!url) throw new Error(`missing release part asset: ${part.name}`);
      const response = await request(url); const ph = crypto.createHash('sha256'); let ps = 0;
      for await (const chunk of response.body) { ph.update(chunk); full.update(chunk); ps += chunk.length; total += chunk.length; if (!ws.write(chunk)) await new Promise(resolve => ws.once('drain', resolve)); }
      const got = ph.digest('hex'); if (got !== part.sha256 || ps !== Number(part.size)) throw new Error(`part verification failed: ${part.name}`);
    }
    await new Promise((resolve, reject) => ws.end(e => e ? reject(e) : resolve()));
    if (full.digest('hex') !== f.sha256 || total !== Number(f.size)) throw new Error(`blob verification failed: ${rel}`);
    await fsp.rename(tmp, out); console.log(`installed ${rel} (${total} bytes)`);
  } finally { ws.destroy(); await fsp.rm(tmp, { force: true }); }
}
console.log(`Verified ${files.size} model files in ${target}`);
