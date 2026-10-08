import http from 'node:http';

const [baseUrl, model, contextText] = process.argv.slice(2);
const contextLength = Number(contextText);
if (!baseUrl || !model || !Number.isInteger(contextLength) || contextLength < 1) {
  console.error('Usage: node start_ollama_warmup.mjs <baseUrl> <model> <contextLength>');
  process.exit(2);
}

const endpoint = new URL('/api/generate', baseUrl);
const body = JSON.stringify({
  model,
  prompt: '',
  stream: false,
  think: false,
  keep_alive: '30m',
  options: { num_ctx: contextLength, num_predict: 1 },
});
const started = Date.now();
const request = http.request({
  hostname: endpoint.hostname,
  port: endpoint.port || 80,
  path: endpoint.pathname,
  method: 'POST',
  headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
}, (response) => {
  const chunks = [];
  response.on('data', (chunk) => chunks.push(chunk));
  response.on('end', () => {
    const text = Buffer.concat(chunks).toString('utf8');
    if (response.statusCode < 200 || response.statusCode >= 300) {
      console.error(`Ollama warmup HTTP ${response.statusCode}: ${text.slice(0, 500)}`);
      process.exitCode = 1;
      return;
    }
    try {
      const result = JSON.parse(text);
      console.log(JSON.stringify({
        model: result.model,
        elapsed_ms: Date.now() - started,
        load_duration_ns: result.load_duration,
        eval_count: result.eval_count,
        done_reason: result.done_reason,
      }));
    } catch {
      console.error('Ollama warmup returned invalid JSON.');
      process.exitCode = 1;
    }
  });
});
request.setTimeout(90000, () => request.destroy(new Error('Ollama warmup timed out after 90 seconds.')));
request.on('error', (error) => {
  console.error(`Ollama warmup failed: ${error.message}`);
  process.exitCode = 1;
});
request.end(body);
