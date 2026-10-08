param([int]$Port = 18766)
$ErrorActionPreference = 'Stop'
$base = $PSScriptRoot
$app = Join-Path $base 'app'
$node = Join-Path $base 'runtime\node\node.exe'
$ollama = Join-Path $base 'runtime\ollama\ollama.exe'
$models = Join-Path $base 'data\models'
$ollamaPort = 11435
$modelName = if ($env:ME5412_MODEL) { $env:ME5412_MODEL } else { 'qwen3:8b' }
if (!(Test-Path $node) -or !(Test-Path (Join-Path $app 'server.js')) -or !(Test-Path $ollama)) { throw 'Portable package is incomplete: bundled Node, app, or Ollama is missing.' }
$env:OLLAMA_MODELS = $models
$env:OLLAMA_HOST = "127.0.0.1:$ollamaPort"
$env:ME5412_OLLAMA_PORT = "$ollamaPort"
$env:PORT = "$Port"
New-Item -ItemType Directory -Force -Path $models | Out-Null
$ollamaProcess = Start-Process -FilePath $ollama -ArgumentList @('serve') -WorkingDirectory (Join-Path $base 'runtime\ollama') -WindowStyle Hidden -PassThru
$tagsUrl = "http://127.0.0.1:$ollamaPort/api/tags"
$modelReady = $false
for ($i=0; $i -lt 45; $i++) {
  if ($ollamaProcess.HasExited) { throw "Bundled Ollama exited with code $($ollamaProcess.ExitCode). Run setup-model.cmd and retry." }
  try {
    $tags = (Invoke-WebRequest -Uri $tagsUrl -UseBasicParsing -TimeoutSec 2).Content | ConvertFrom-Json
    $modelReady = @($tags.models) | Where-Object { $_.name -eq $modelName -or $_.model -eq $modelName }
    if ($modelReady) { break }
  } catch {}
  Start-Sleep -Milliseconds 500
}
if (!$modelReady) { Stop-Process -Id $ollamaProcess.Id -Force -ErrorAction SilentlyContinue; throw "Bundled Ollama is running but $modelName is not installed. Run setup-model.cmd while online, then retry." }
$server = Start-Process -FilePath $node -ArgumentList @('server.js','--open') -WorkingDirectory $app -WindowStyle Hidden -PassThru
$url = "http://127.0.0.1:$Port/"
for ($i=0; $i -lt 45; $i++) {
  Start-Sleep -Milliseconds 500
  try { $r = Invoke-WebRequest -Uri ($url+'api/status') -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { Start-Process $url; Write-Host "ME5412 portable app ready at $url (PID $($server.Id))"; exit 0 } } catch {}
  if ($server.HasExited) { throw "Application exited with code $($server.ExitCode)." }
}
Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
Stop-Process -Id $ollamaProcess.Id -Force -ErrorAction SilentlyContinue
throw "Application did not become ready within 23 seconds."
