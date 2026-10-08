#!/usr/bin/env node
/** Evaluation-only paraphrase runner. Never imported by the product runtime. */
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(here, 'validation_variants.json');
const outputPath = path.join(here, 'validation_variants_results.json');
const compact = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
function fail(message) { throw new Error(message); }
function selectedLetters(text, question) {
  const lines = String(text ?? '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const found = new Set();
  const marker = /(?:final\s+(?:selection|answer)|answer|\u6700\u7ec8\u9009\u62e9|\u6700\u7ec8\u7b54\u6848|\u7b54\u6848)\s*[:\uff1a]?/i;
  const markerIndex = lines.findIndex(line => marker.test(line));
  const startLine = markerIndex >= 0 ? markerIndex : 0;
  const first = (lines[startLine] || '').replace(marker, ' ').trim();
  const selectedLines = first ? [first] : [];
  const optionOnly = line => /^[A-E]\s*[.)\u3001:\uff1a]\s*\S/i.test(line);
  for (let index = startLine + 1; index < lines.length; index += 1) {
    if (!optionOnly(lines[index])) break;
    selectedLines.push(lines[index]);
  }
  const segment = selectedLines.join(' ');
  // Prefer explicit labels in the model's final-selection block. This prevents
  // option-text substring collisions such as "II only" inside "I and III only".
  for (const match of segment.matchAll(/(?:^|[\s,;|/])([A-E])\s*(?:[.)\u3001:\uff1a]|$)/gi)) found.add(match[1].toUpperCase());
  if (found.size) return [...found].sort();
  // Only fall back to answer-text matching when no explicit option label was emitted.
  const normal = compact(segment);
  for (const option of question.options) {
    const textOnly = compact(String(option).replace(/^[A-E]\s*[.)\u3001:\uff1a]\s*/, ''));
    if (textOnly && normal.includes(textOnly)) found.add(String(option).trim()[0].toUpperCase());
  }
  return [...found].sort();
}
function judge(question, response) {
  const expected = [...question.answer].sort();
  const selected = selectedLetters(response?.answer, question);
  return { correct: selected.length === expected.length && selected.every((letter, i) => letter === expected[i]), expected, selected, answer: response?.answer || '' };
}
async function load() {
  const fixture = JSON.parse(await fs.readFile(fixturePath, 'utf8'));
  if (!Array.isArray(fixture.questions) || fixture.questions.length !== 25) fail('expected 25 variants including explicitly skipped Q14');
  const ids = new Set(fixture.questions.map(q => q.sourceId));
  for (let i = 1; i <= 25; i += 1) if (!ids.has(i)) fail('missing source question ' + i);
  const q14 = fixture.questions.find(q => q.sourceId === 14);
  if (q14.verificationRisk !== 'image-dependent; intentionally excluded from score because the screenshot is not sent to /api/ask') fail('Q14 must remain explicitly unscored and image-dependent');
  for (const q of fixture.questions) {
    if (!q.question || !Array.isArray(q.options) || !Array.isArray(q.answer)) fail(q.id + ' malformed');
    if (!['single', 'multi'].includes(q.mode)) fail(q.id + ' missing explicit mode');
    if (q.mode === 'multi' && q.sourceId !== 25) fail(q.id + ' unexpected multi-select');
  }
  return fixture;
}
async function ask(baseUrl, q, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const mode = q.mode === 'multi' ? '（多选）' : '（单选）';
    const payload = [q.question + mode, ...q.options].join('\n');
    const res = await fetch(baseUrl + '/api/ask', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({question: payload}), signal: controller.signal });
    const bodyText = await res.text();
    let body; try { body = JSON.parse(bodyText); } catch { body = {error: bodyText}; }
    if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + (body.error || bodyText));
    return body;
  } finally { clearTimeout(timer); }
}
const emit = value => process.stdout.write(JSON.stringify(value, null, 2) + '\n');
function reportFor(fixture, results) {
  const scoredResults = results.filter(result => !result.skipped && result.sourceId !== 14);
  const correct = scoredResults.filter(result => result.correct).length;
  return {total: fixture.questions.length, scoredQuestions: fixture.questions.filter(q => q.sourceId !== 14).length, completed: results.length, correct, accuracy: scoredResults.length ? correct / scoredResults.length : 0, results};
}
async function main() {
  const fixture = await load();
  const args = new Set(process.argv.slice(2));
  if (args.has("--check") || (!args.has("--run") && !args.has("--resume") && !args.has("--retry") && !args.has("--rescore") && !args.has("--self-test"))) {
    emit({ok:true,total:fixture.questions.length,sourceQuestions:[...new Set(fixture.questions.map(q=>q.sourceId))].sort((a,b)=>a-b),excluded:[14],scoredQuestions:24,modes:{single:fixture.questions.filter(q=>q.mode==="single").length,multi:fixture.questions.filter(q=>q.mode==="multi").length}});
    return;
  }
  if (args.has('--self-test')) {
    const overlap = {options:['A. II only','B. I and III only','C. I, III, and IV only'], answer:['B']};
    const overlapSelected = selectedLetters('Final answer: B. I and III only', overlap);
    if (overlapSelected.join(',') !== 'B') throw Error('overlap self-test failed: ' + overlapSelected.join(','));
    const multi = {options:['A. Infrared sensors','B. Force sensors','C. IMU','D. Ultrasound sensors'], answer:['A','C','D']};
    const multiSelected = selectedLetters('Final answer:\\nA. Infrared sensors\\nC. IMU\\nD. Ultrasound sensors', multi);
    if (multiSelected.join(',') !== 'A,C,D') throw Error('multiline self-test failed: ' + multiSelected.join(','));
    emit({ok:true, selfTest:'explicit-label-overlap-and-multiline-multiselect'});
    return;
  }
  if (args.has('--check') || (!args.has('--run') && !args.has('--resume') && !args.has('--retry') && !args.has('--rescore') && !args.has('--self-test'))) {
    emit({ok:true,total:fixture.questions.length,sourceQuestions:[...new Set(fixture.questions.map(q=>q.sourceId))].sort((a,b)=>a-b),excluded:[14],modes:{single:fixture.questions.filter(q=>q.mode==='single').length,multi:fixture.questions.filter(q=>q.mode==='multi').length}});
    return;
  }
  if (args.has('--rescore')) {
    const saved = JSON.parse(await fs.readFile(outputPath, 'utf8'));
    if (!Array.isArray(saved.results)) throw Error('validation_variants_results.json has no results array');
    const byId = new Map(fixture.questions.map(q => [q.id, q]));
    const resultsById = new Map(saved.results.map(result => [result.id, result]));
    const results = fixture.questions.map(question => {
      const savedResult = resultsById.get(question.id);
      if (question.sourceId === 14) return savedResult || {id:question.id, sourceId:14, skipped:true, completed:true, reason:'image-dependent; excluded by user'};
      if (!savedResult) return {id:question.id, sourceId:question.sourceId, correct:false, completed:false, error:'no saved model answer'};
      return {...savedResult, ...judge(question, {answer: savedResult.answer})};
    });
    const report = reportFor(fixture, results);
    await fs.writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');
    emit({ok:true, mode:'rescore', total:report.total, completed:report.completed, correct:report.correct, accuracy:report.accuracy});
    return;
  }
  const baseUrl = (process.argv.find(a => a.startsWith('--url='))?.slice(6) || 'http://127.0.0.1:18765').replace(/\/$/, '');
  const timeoutMs = Number(process.env.VARIANT_TIMEOUT_MS || 180000);
  let report = reportFor(fixture, []);
  if (args.has('--resume')) { try { report = JSON.parse(await fs.readFile(outputPath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
  const existing = new Map((report.results || []).map(r => [r.id, r]));
  for (const q of fixture.questions) {
    if (existing.has(q.id) && !args.has('--retry')) continue;
    const started = Date.now();
    let result;
    if (q.sourceId === 14) {
      result = {id:q.id, sourceId:14, skipped:true, completed:true, reason:'image-dependent; excluded by user; no image sent to /api/ask'};
    } else {
      try { const response = await ask(baseUrl, q, timeoutMs); result = {id:q.id, sourceId:q.sourceId, ...judge(q, response), elapsedMs:Date.now()-started, model:response.model}; }
      catch (error) { result = {id:q.id, sourceId:q.sourceId, correct:false, expected:q.answer, selected:[], error:error?.name === 'AbortError' ? 'timeout' : String(error?.message || error), elapsedMs:Date.now()-started}; }
    }
    existing.set(q.id, result);
    const results = fixture.questions.map(item => existing.get(item.id)).filter(Boolean);
    report = reportFor(fixture, results);
    await fs.writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');
    emit({id:q.id, sourceId:q.sourceId, correct:result.correct, selected:result.selected, completed:results.length, total:fixture.questions.length, accuracy:report.accuracy, elapsedMs:result.elapsedMs});
  }
  emit(report);
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
