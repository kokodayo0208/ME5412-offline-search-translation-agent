const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Static interaction harness: validates the state boundaries without invoking
// the local model or a server route.
const app = fs.readFileSync(path.join(__dirname, '..', 'app.html'), 'utf8');
const lifecycle = fs.readFileSync(path.join(__dirname, '..', 'ask-lifecycle.js'), 'utf8');

test('course and translation workspaces retain separate DOM state across tabs', () => {
  for (const id of ['courseWorkspace', 'results', 'preview', 'answerText', 'translationWorkspace', 'translateText', 'translationOutput', 'translationStatus']) {
    assert.match(app, new RegExp('id="' + id + '"'));
  }
  assert.match(app, /courseWorkspace'\)\.classList\.toggle\('hidden',n==='t'\)/);
  assert.match(app, /translationWorkspace'\)\.classList\.toggle\('hidden',n!=='t'\)/);
  assert.match(app, /Tab changes only alter visibility|Switching tabs only changes visibility/);
});

test('translation has an independent controller and does not write course results', () => {
  assert.match(app, /let translationRequest=null/);
  assert.match(app, /signal:controller\.signal/);
  assert.match(app, /translateCancel'\)\.onclick=.*translationRequest\?\.abort/);
  const translationBlock = app.slice(app.indexOf('let translationRequest=null'), app.indexOf("$('vBar').onsubmit"));
  assert.equal(translationBlock.includes('setAnswer('), false);
  assert.equal(translationBlock.includes("$('results')"), false);
  assert.match(lifecycle, /let searchRequest = null/);
  assert.match(lifecycle, /let answerRequest = null/);
});
