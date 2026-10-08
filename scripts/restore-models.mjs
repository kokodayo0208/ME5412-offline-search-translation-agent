#!/usr/bin/env node
/* Restore a model backup after explicit invocation; never deletes or overwrites. */
import fs from 'node:fs'; import fsp from 'node:fs/promises'; import path from 'node:path'; import crypto from 'node:crypto';
const backup = path.resolve(process.argv[2] || path.join(process.cwd(), '.model-backup-release'));
const target = path.resolve(process.argv[3] || path.join(process.env.USERPROFILE || process.env.HOME || '.', '.ollama', 'models'));
const manifest = JSON.parse(await fsp.readFile(path.join(backup, 'backup-manifest.json'), 'utf8'));
const digest = async file => { const h = crypto.createHash('sha256'); let size = 0; for await (const c of fs.createReadStream(file)) { h.update(c); size += c.length; } return { sha256: h.digest('hex'), size }; };
const joinSafe = rel => { const clean = rel.replaceAll('\\', '/'); if (!clean || clean.startsWith('/') || clean.split('/').includes('..') || /^[A-Za-z]:/.test(clean)) throw new Error(`unsafe relative path: ${rel}`); const p = path.resolve(target, clean); if (p !== target && !p.startsWith(target + path.sep)) throw new Error(`path escapes target: ${rel}`); return p; };
await fsp.mkdir(target, { recursive: true });
const writes = new Map();
for (const f of manifest.files) { const previous = writes.get(f.relativePath); if (previous && previous.sha256 !== f.sha256) throw new Error(`conflicting sources for ${f.relativePath}`); writes.set(f.relativePath, f); }
for (const [rel, f] of writes) {
  const dest = joinSafe(rel); if (fs.existsSync(dest)) { const got = await digest(dest); if (got.sha256 !== f.sha256 || got.size !== f.size) throw new Error(`refusing to overwrite different existing file: ${rel}`); continue; }
  await fsp.mkdir(path.dirname(dest), { recursive: true }); const tmp = `${dest}.restore-${process.pid}`;
  if (f.kind === 'metadata') await fsp.copyFile(path.join(backup, f.backupPath), tmp);
  else { const dir = path.join(backup, 'blobs', f.sha256); const out = fs.createWriteStream(tmp); for (const p of manifest.blobs.find(x => x.sha256 === f.sha256).parts) { const part = path.join(dir, p.name); const got = await digest(part); if (got.sha256 !== p.sha256 || got.size !== p.size) throw new Error(`part verification failed: ${f.sha256}/${p.name}`); await new Promise((r, j) => { const rs = fs.createReadStream(part); rs.on('error', j); rs.on('end', r); rs.pipe(out, { end: false }); }); } await new Promise((r, j) => out.end(e => e ? j(e) : r())); }
  const got = await digest(tmp); if (got.sha256 !== f.sha256 || got.size !== f.size) { await fsp.rm(tmp, { force: true }); throw new Error(`restored hash verification failed: ${rel}`); } await fsp.rename(tmp, dest);
}
console.log(`Restored and verified ${writes.size} files into ${target}`);
