param([int]$Port = 18766)
$ErrorActionPreference = 'Stop'
$base = $PSScriptRoot
$app = Join-Path $base 'app'
$node = Join-Path $base 'runtime\node\node.exe'
$ollama = Join-Path $base 'runtime\ollama\ollama.exe'
$models = Join-Path $base 'data\models'
$ollamaPort = 11435
if (!(Test-Path $node) -or !(Test-Path (Join-Path $app 'server.js'))) { throw 'Portable package is incomplete.' }
$env:OLLAMA_MODELS = $models
$env:OLLAMA_HOST = "127.0.0.1:$ollamaPort"
$env:ME5412_OLLAMA_PORT = "$ollamaPort"
$env:PORT = "$Port"
New-Item -ItemType Directory -Force -Path $models | Out-Null
$ollamaProcess = $null
if (Test-Path $ollama) {
  $ollamaProcess = Start-Process -FilePath $ollama -ArgumentList @('serve') -WorkingDirectory (Join-Path $base 'runtime\ollama') -WindowStyle Hidden -PassThru
}
$server = Start-Process -FilePath $node -ArgumentList @('server.js','--open') -WorkingDirectory $app -WindowStyle Hidden -PassThru
$url = "http://127.0.0.1:$Port/"
for ($i=0; $i -lt 45; $i++) {
  Start-Sleep -Milliseconds 500
  try { $r = Invoke-WebRequest -Uri ($url+'api/status') -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { Start-Process $url; Write-Host "ME5412 portable app ready at $url (PID $($server.Id))"; exit 0 } } catch {}
  if ($server.HasExited) { throw "Application exited with code $($server.ExitCode)." }
}
throw "Application did not become ready within 23 seconds."
