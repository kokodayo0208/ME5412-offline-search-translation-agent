#!/usr/bin/env node
/** Independent validation harness; never loaded by the product runtime. */
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(here, 'validation_questions.json');

function fail(message) { throw new Error(message); }
function compact(value) { return String(value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim(); }
function optionLetter(value) {
  const match = String(value ?? '').match(/^\s*([A-Z])\s*[.)]/i);
  return match ? match[1].toUpperCase() : '';
}
function expectedLetters(question) {
  return (Array.isArray(question.answer) ? question.answer : [question.answer]).map(optionLetter).filter(Boolean);
}

export function selectionSegment(answerText) {
  const lines = String(answerText ?? '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const marker = /^(?:\u6700\u7ec8\u9009\u62e9|\u6700\u7ec8\u7b54\u6848|\u7b54\u6848|final\s+selection|final\s+answer|answer)\s*[:\uFF1A]?\s*/i;
  const markerIndex = lines.findIndex(line => marker.test(line));
  if (markerIndex < 0) return lines[0] || "";
  const first = lines[markerIndex].replace(marker, "").trim();
  const selectedLines = [];
  if (first) selectedLines.push(first);
  const optionOnly = line => /^[A-E]\s*[.)\u3001:\uFF1A]\s*\S(?:.*)?$/i.test(line);
  for (let index = markerIndex + 1; index < lines.length; index += 1) {
    if (!optionOnly(lines[index])) break;
    selectedLines.push(lines[index]);
  }
  return selectedLines.join(" ");
}

export function selectedChoices(question, answerText) {
  const segment = selectionSegment(answerText);
  const normalizedSegment = compact(segment);
  const letters = new Set();
  for (const match of segment.matchAll(/(?:^|[\s,?;?|/])([A-E])\s*(?:[.)?:\uFF1A]|$)/gi)) letters.add(match[1].toUpperCase());
  const copiedTexts = [];
  for (const option of question.options) {
    if (normalizedSegment.includes(compact(option))) {
      letters.add(optionLetter(option));
      copiedTexts.push(option);
    }
  }
  return { segment, letters: [...letters].filter(Boolean).sort(), copiedTexts };
}

export function judge(question, response) {
  const answerText = String(response?.answer ?? '');
  const expected = new Set(expectedLetters(question));
  const selected = selectedChoices(question, answerText);
  const actual = new Set(selected.letters);
  const correct = actual.size === expected.size && [...actual].every(letter => expected.has(letter));
  const clues = [];
  if (!selected.letters.length) clues.push('no option found on the final-selection line');
  if (actual.size !== expected.size || [...actual].some(letter => !expected.has(letter))) {
    clues.push('selected option set was ' + (selected.letters.join(', ') || 'empty') + '; expected ' + [...expected].join(', '));
  }
  if (question.multiSelect && selected.copiedTexts.length !== selected.letters.length) clues.push('multi-select line did not copy every option text; letters were used');
  if (!answerText) clues.push('empty model response');
  return { correct, expected: [...expected].join(', '), selected: selected.letters.join(', '), selectionLine: selected.segment, clues };
}

async function loadFixture() {
  const data = JSON.parse(await fs.readFile(fixturePath, 'utf8'));
  if (!Array.isArray(data.questions)) fail('fixture.questions must be an array');
  return data;
}

export function validateFixture(data) {
  const errors = [];
  const questions = data?.questions;
  if (!Array.isArray(questions) || questions.length !== 25) errors.push('expected exactly 25 questions');
  const ids = (questions || []).map(question => question.id);
  for (let id = 1; id <= 25; id += 1) if (!ids.includes(id)) errors.push('missing Q' + id);
  for (const question of questions || []) {
    if (!question.question || !Array.isArray(question.options) || question.options.length < 2) errors.push('Q' + question.id + ' missing stem/options');
    if (!question.answer || (Array.isArray(question.answer) && question.answer.length === 0)) errors.push('Q' + question.id + ' missing expected answer');
    if (question.id === 14 && question.verificationRisk !== 'image-dependent; unverifiable from extracted text alone') errors.push('Q14 missing image risk marker');
    if (question.id === 25 && question.multiSelect !== true) errors.push('Q25 must be marked multi-select');
  }
  return errors;
}

async function ask(baseUrl, question, timeoutMs = 180000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const mode = question.multiSelect ? '\uFF08\u591A\u9009\uFF09' : '\uFF08\u5355\u9009\uFF09';
    const payload = [question.question + mode, ...question.options].join('\n');
    const response = await fetch(baseUrl + '/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: payload }),
      signal: controller.signal
    });
    const text = await response.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { error: text }; }
    if (!response.ok) throw new Error('HTTP ' + response.status + ': ' + (body.error || text));
    return body;
  } finally { clearTimeout(timer); }
}

function encodeJson(value, pretty = false) {
  return JSON.stringify(value, null, pretty ? 2 : 0).replace(/[^\x00-\x7F]/g, character => '\\u' + character.codePointAt(0).toString(16).padStart(4, '0'));
}
function emit(value) { process.stdout.write(encodeJson(value, true) + '\n'); }
function emitProgress(value) { process.stdout.write(encodeJson(value, false) + '\n'); }

async function main() {
  const data = await loadFixture();
  const errors = validateFixture(data);
  if (errors.length) { emit({ ok: false, errors }); process.exitCode = 2; return; }
  const args = new Set(process.argv.slice(2));
  if (args.has('--check') || !args.has('--run')) {
    emit({ ok: true, questions: 25, scoredQuestions: 24, excluded: ['Q14: image-dependent; unverifiable from extracted text alone'], multiSelect: ['Q25'] });
    if (!args.has('--run')) return;
  }
  const urlArg = process.argv.find(value => value.startsWith('--url='));
  const baseUrl = (urlArg ? urlArg.slice(6) : 'http://127.0.0.1:18765').replace(/\/$/, '');
  const includeQ14 = args.has('--include-q14');
  const retryFailed = args.has('--retry-failed');
  const retryIncorrect = args.has('--retry-incorrect');
  const resultsPath = path.join(here, 'validation_results.json');
  let results = [];
  if (args.has('--resume')) {
    try {
      const saved = JSON.parse(await fs.readFile(resultsPath, 'utf8'));
      if (Array.isArray(saved.results)) results = saved.results.filter(result => Number.isInteger(result.id));
    } catch (error) {
      if (error?.code !== 'ENOENT') throw new Error('cannot resume from validation_results.json: ' + error.message);
    }
  }
  const completed = new Set(results.map(result => result.id));
  const persist = async () => {
    const scored = results.filter(result => !result.skipped);
    const correct = scored.filter(result => result.correct).length;
    const report = { totalQuestions: 25, scoredQuestions: scored.length, correct, accuracy: scored.length ? correct / scored.length : 0, completed: results.length, excluded: results.filter(result => result.skipped), results };
    await fs.writeFile(resultsPath, JSON.stringify(report, null, 2), 'utf8');
    return report;
  };
  await persist();
  for (const question of data.questions) {
    if (completed.has(question.id)) {
      const previous = results.find(result => result.id === question.id);
      const transportFailure = previous && !previous.correct && /(?:timeout|HTTP\s+\d{3})/i.test(String(previous.error || ''));
      const shouldRetry = (retryFailed && transportFailure) || (retryIncorrect && previous && previous.correct === false);
      if (!shouldRetry) {
        emitProgress({ type: 'progress', id: question.id, status: 'resumed-skip', completed: results.length, total: 25 });
        continue;
      }
      results = results.filter(result => result.id !== question.id);
      completed.delete(question.id);
      emitProgress({ type: 'progress', id: question.id, status: 'retry', completed: results.length, total: 25 });
    }
    if (question.id === 14 && !includeQ14) {
      results.push({ id: question.id, skipped: true, completed: true, reason: 'excluded by user; image is not sent to /api/ask' });
      completed.add(question.id);
      await persist();
      emit({ type: 'progress', id: question.id, status: 'skipped', completed: results.length, total: 25 });
      continue;
    }
    const started = Date.now();
    let result;
    try {
      const response = await ask(baseUrl, question);
      const judgment = judge(question, response);
      result = { id: question.id, ...judgment, completed: true, model: response.model, elapsedMs: Date.now() - started, answer: response.answer };
    } catch (error) {
      result = { id: question.id, correct: false, completed: true, error: error?.name === 'AbortError' ? 'timeout' : String(error?.message || error), elapsedMs: Date.now() - started, clues: ['API call failed or timed out'] };
    }
    results.push(result);
    completed.add(question.id);
    const report = await persist();
    emit({ type: 'progress', id: question.id, status: result.correct ? 'correct' : 'incorrect', completed: report.completed, total: 25, correct: report.correct, scoredQuestions: report.scoredQuestions, accuracy: report.accuracy, elapsedMs: result.elapsedMs });
  }
  emit(await persist());
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
