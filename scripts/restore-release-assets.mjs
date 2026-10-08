#!/usr/bin/env node
/* Rebuild the directory layout expected by restore-models.mjs from flat GitHub assets. */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const assets = path.resolve(process.argv[2] || path.join(process.cwd(), 'release-assets'));
const output = path.resolve(process.argv[3] || path.join(process.cwd(), '.model-backup-release-restored'));
const safeRelative = rel => {
  const clean = rel.replaceAll('\\', '/');
  if (!clean || clean.startsWith('/') || clean.split('/').includes('..') || /^[A-Za-z]:/.test(clean)) throw new Error(`unsafe relative path: ${rel}`);
  const resolved = path.resolve(output, clean);
  if (resolved !== output && !resolved.startsWith(output + path.sep)) throw new Error(`path escapes output: ${rel}`);
  return resolved;
};
const digest = async file => {
  const hash = crypto.createHash('sha256'); let size = 0;
  for await (const chunk of fs.createReadStream(file)) { hash.update(chunk); size += chunk.length; }
  return { sha256: hash.digest('hex'), size };
};
const verify = async (file, expected, label) => {
  const got = await digest(file);
  if (got.size !== expected.size || got.sha256 !== expected.sha256) throw new Error(`asset verification failed for ${label}: ${got.sha256}/${got.size}`);
};
const copyVerified = async (source, relative, expected, label) => {
  await verify(source, expected, label);
  const destination = safeRelative(relative);
  if (fs.existsSync(destination)) { await verify(destination, expected, `existing ${relative}`); return; }
  await fsp.mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.restore-${process.pid}`;
  try { await fsp.copyFile(source, temporary); await verify(temporary, expected, `copied ${relative}`); await fsp.rename(temporary, destination); }
  finally { await fsp.rm(temporary, { force: true }); }
};
const manifestName = ['backup-manifest.json', 'model-backup-manifest.json'].find(name => fs.existsSync(path.join(assets, name)));
if (!manifestName) throw new Error('release assets must include backup-manifest.json or model-backup-manifest.json');
const manifest = JSON.parse(await fsp.readFile(path.join(assets, manifestName), 'utf8'));
const expected = new Map();
const add = (name, relative, record) => {
  const old = expected.get(name);
  if (old && (old.relative !== relative || old.record.sha256 !== record.sha256 || old.record.size !== record.size)) throw new Error(`flat asset name collision: ${name}`);
  expected.set(name, { relative, record });
};
for (const blob of manifest.blobs || []) for (const part of blob.parts || []) add(`model-${blob.sha256}-${part.name}`, path.join('blobs', blob.sha256, part.name), { sha256: part.sha256, size: part.size });
for (const file of manifest.files || []) if (file.kind === 'metadata') {
  const backupPath = file.backupPath.replaceAll('\\', '/');
  const flatPath = backupPath.startsWith('metadata/') ? backupPath.slice('metadata/'.length) : backupPath;
  add(`model-metadata-${flatPath.replaceAll('/', '-')}`, backupPath, { sha256: file.sha256, size: file.size });
}
let checked = 0;
for (const [name, item] of expected) { const source = path.join(assets, name); if (!fs.existsSync(source)) throw new Error(`missing release asset: ${name}`); await copyVerified(source, item.relative, item.record, name); checked++; }
await fsp.mkdir(output, { recursive: true });
await fsp.copyFile(path.join(assets, manifestName), path.join(output, 'backup-manifest.json'));
console.log(`Rebuilt and verified ${checked} release assets into ${output}`);
