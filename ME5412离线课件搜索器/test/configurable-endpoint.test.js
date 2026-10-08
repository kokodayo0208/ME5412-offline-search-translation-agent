const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');
const path = require('node:path');

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

function get(port, route) {
  return new Promise((resolve, reject) => {
    const request = http.get({ host: '127.0.0.1', port, path: route }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString() }));
    });
    request.on('error', reject);
  });
}

test('server uses the configured Ollama endpoint for readiness checks', async (t) => {
  const fakeOllama = http.createServer((request, response) => {
    const body = request.url === '/api/ps'
      ? { models: [{ name: 'qwen3:8b' }] }
      : { models: [{ name: 'qwen3:8b' }] };
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
  });
  const ollamaPort = await listen(fakeOllama);
  const appPort = await new Promise((resolve, reject) => {
    const probe = http.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => { const port = probe.address().port; probe.close(() => resolve(port)); });
  });
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(appPort), ME5412_OLLAMA_HOST: '127.0.0.1', ME5412_OLLAMA_PORT: String(ollamaPort) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => { child.kill(); fakeOllama.close(); });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start')), 5000);
    child.stdout.on('data', (chunk) => { if (chunk.toString().includes(`:${appPort}/`)) { clearTimeout(timer); resolve(); } });
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error(`server exited with ${code}`)));
  });
  const status = await get(appPort, '/api/ai-status');
  assert.equal(status.status, 200);
  assert.deepEqual(JSON.parse(status.body), { ready: true, available: true, model: 'qwen3:8b' });
});
