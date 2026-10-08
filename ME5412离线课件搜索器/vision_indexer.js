#!/usr/bin/env node
'use strict';

/* Render every PDF page and ask the local Ollama vision model to describe the
   visible text/figures. Results are checkpointed in visual_supplements.json,
   so an interrupted run can be resumed safely. This script never calls the
   internet: only 127.0.0.1:11434 is used. */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { createCanvas } = require('@napi-rs/canvas');

const APP = __dirname;
const ROOT = path.resolve(process.argv[2] || path.join(APP, '..'));
const SUP = path.join(APP, 'visual_supplements.json');
const MODEL = process.env.ME5412_VISION_MODEL || 'qwen3-vl:4b-instruct';
const argv = process.argv.slice(3);
const opt = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const has = name => argv.includes(name);
const fileFilter = opt('--file');
const maxPages = Number(opt('--max-pages') || 0);
const limit = Number(opt('--limit') || 0);
const force = has('--force');
const delayMs = Number(opt('--delay') || 0);

function readSupplements() {
  try { return JSON.parse(fs.readFileSync(SUP, 'utf8')); }
  catch { return {}; }
}
let supplements = readSupplements();
function saveSupplements() {
  const tmp = SUP + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(supplements, null, 2), 'utf8');
  fs.renameSync(tmp, SUP);
}
function clean(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.pdf$/i.test(e.name)) out.push(p);
  }
  return out.sort();
}
function sleep(ms) { return ms ? new Promise(r => setTimeout(r, ms)) : Promise.resolve(); }

function ollama(payload, timeout = 600000) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = http.request({ host: '127.0.0.1', port: 11434, path: '/api/chat', method: 'POST', timeout,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => {
      const chunks = []; res.on('data', c => chunks.push(c));
      res.on('end', () => { try { const x = JSON.parse(Buffer.concat(chunks));
        if (res.statusCode >= 400) reject(new Error(x.error || 'Ollama error')); else resolve(x);
      } catch (e) { reject(new Error('Invalid Ollama response: ' + e.message)); } });
    });
    req.on('timeout', () => req.destroy(new Error('Ollama timeout')));
    req.on('error', reject); req.end(body);
  });
}

async function renderPage(page, scale = 1.5) {
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toBuffer('image/jpeg', 82).toString('base64');
}

async function processFile(file) {
  const key = path.basename(file);
  if (fileFilter && !key.toLowerCase().includes(fileFilter.toLowerCase())) return 0;
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), disableWorker: true, useWorkerFetch: false, isEvalSupported: false, verbosity: 0 }).promise;
  let done = 0;
  if (!supplements[key] || typeof supplements[key] !== 'object' || Array.isArray(supplements[key])) supplements[key] = {};
  try {
    const total = Math.min(doc.numPages, maxPages || doc.numPages);
    for (let n = 1; n <= total; n++) {
      if (!force && supplements[key][n] && String(supplements[key][n]).includes('[VISUAL OCR')) {
        console.log(`[skip] ${key} page ${n}`); continue;
      }
      const page = await doc.getPage(n);
      const image = await renderPage(page);
      const prompt = `You are building an offline searchable index for a university lecture PDF. Analyze this single slide/page. Transcribe all readable visible text faithfully, including headings, bullets, table cells, labels, option lists, captions, and words inside diagrams. Then summarize what the figures/diagram/table mean and list key searchable terms. Do not invent unreadable text. Output plain text only with sections: TITLE, TRANSCRIPT, VISUAL_CONTENT, KEY_TERMS. This is page ${n} of ${doc.numPages}.`;
      const result = await ollama({ model: MODEL, stream: false, think: false, keep_alive: '30m', options: { temperature: 0.05, num_ctx: 8192 }, messages: [{ role: 'user', content: prompt, images: [image] }] });
      const answer = clean(result.message?.content || '');
      if (!answer) throw new Error('empty model response');
      supplements[key][n] = `[VISUAL OCR page ${n}] ${answer}`;
      saveSupplements(); done++;
      console.log(`[ok] ${key} page ${n}/${doc.numPages}`);
      await sleep(delayMs);
    }
  } finally { await doc.cleanup(); }
  return done;
}

async function main() {
  const files = walk(ROOT);
  let selected = files;
  if (limit > 0) selected = selected.slice(0, limit);
  console.log(`Local vision indexing: ${selected.length} PDF(s), model=${MODEL}`);
  let count = 0;
  for (const file of selected) {
    try { count += await processFile(file); }
    catch (e) { console.error(`[error] ${path.basename(file)}: ${e.message}`); }
  }
  console.log(`Completed ${count} page(s). Rebuilding text index...`);
  console.log('Run `node indexer.js "' + ROOT + '"` after this process to merge OCR into index.json.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
