$ErrorActionPreference = 'Stop'

$model = 'qwen3:8b'
$contextLength = 4096
$ollamaHost = if ($env:ME5412_OLLAMA_HOST) { $env:ME5412_OLLAMA_HOST } else { '127.0.0.1' }
$ollamaPort = 11434
if ($env:ME5412_OLLAMA_PORT) {
    $parsedPort = 0
    if ([int]::TryParse($env:ME5412_OLLAMA_PORT, [ref]$parsedPort) -and $parsedPort -gt 0 -and $parsedPort -lt 65536) { $ollamaPort = $parsedPort }
}
$baseUrl = "http://{0}:{1}" -f $ollamaHost, $ollamaPort
$ollamaExe = Join-Path $PSScriptRoot 'runtime\ollama\ollama.exe'
if (-not (Test-Path -LiteralPath $ollamaExe -PathType Leaf)) { $ollamaExe = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe' }
$defaultStore = Join-Path $env:USERPROFILE '.ollama\models'
$configuredStore = $env:OLLAMA_MODELS
$portableStore = $env:ME5412_MODELS_DIR
$manifest = 'manifests\registry.ollama.ai\library\qwen3\8b'
$modelStore = @($portableStore, $configuredStore, $defaultStore) |
    Where-Object { $_ -and (Test-Path -LiteralPath (Join-Path $_ $manifest) -PathType Leaf) } |
    Select-Object -First 1
if (-not $modelStore) {
    throw "Cannot find the installed $model manifest in configured or default Ollama storage."
}
$env:OLLAMA_MODELS = $modelStore
$env:OLLAMA_HOST = "$ollamaHost`:$ollamaPort"

function Get-InstalledModels {
    try {
        $tags = Invoke-RestMethod -Uri "$baseUrl/api/tags" -TimeoutSec 3
        return @($tags.models | ForEach-Object { $_.name })
    } catch {
        return $null
    }
}

function Get-LoadedModels {
    try {
        $ps = Invoke-RestMethod -Uri "$baseUrl/api/ps" -TimeoutSec 3
        return @($ps.models | Where-Object { $null -ne $_ })
    } catch {
        return $null
    }
}

function Stop-WrongIdleDaemon {
    # A running tray daemon keeps the environment it was originally started
    # with.  If it points at another model store, changing this script's
    # OLLAMA_MODELS cannot make that daemon see qwen3:8b.  Only replace an
    # *idle*, verified Ollama listener; never interrupt a loaded runner.
    $loaded = Get-LoadedModels
    if ($null -eq $loaded -or $loaded.Count -gt 0) {
        throw "Ollama is running without $model and has a loaded model; it was left untouched to avoid interrupting an active job."
    }
    $listenerPattern = ('{0}:{1}\s+0\.0\.0\.0:0\s+LISTENING\s+(\d+)' -f [regex]::Escape($ollamaHost), $ollamaPort)
    $listener = netstat -ano -p tcp | Select-String $listenerPattern | Select-Object -First 1
    if (-not $listener -or $listener.Matches.Count -lt 2) {
        throw "Ollama is reachable but $model is unavailable, and its listener PID could not be verified."
    }
    $listenerPid = [int]$listener.Matches[0].Groups[1].Value
    $process = Get-Process -Id $listenerPid -ErrorAction Stop
    if ($process.ProcessName -ne 'ollama') {
        throw "Port $ollamaPort is owned by $($process.ProcessName), not Ollama; it was left untouched."
    }
    Write-Host "Replacing idle Ollama daemon PID $listenerPid so it uses $modelStore"
    Stop-Process -Id $listenerPid -ErrorAction Stop
    for ($attempt = 0; $attempt -lt 15; $attempt++) {
        Start-Sleep -Seconds 1
        if ($null -eq (Get-InstalledModels)) { return }
    }
    throw "Verified Ollama daemon PID $listenerPid did not stop cleanly."
}

$installed = Get-InstalledModels
if ($null -ne $installed -and $installed -notcontains $model) {
    Stop-WrongIdleDaemon
    $installed = $null
}
if ($null -eq $installed) {
    if (-not (Test-Path -LiteralPath $ollamaExe -PathType Leaf)) {
        throw "Ollama executable not found: $ollamaExe"
    }
    Write-Host 'Starting Ollama in the background...'
    Start-Process -FilePath $ollamaExe -ArgumentList 'serve' -WindowStyle Hidden | Out-Null
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        Start-Sleep -Seconds 1
        $installed = Get-InstalledModels
        if ($null -ne $installed) { break }
    }
    if ($null -eq $installed) { throw 'Ollama did not become ready within 60 seconds.' }
}

if ($installed -notcontains $model) {
    throw "The installed Ollama models do not include $model. Current OLLAMA_MODELS: $env:OLLAMA_MODELS"
}

$loaded = Get-LoadedModels
if ($null -ne $loaded -and @($loaded | Where-Object { $_.name -eq $model }).Count -gt 0) {
    Write-Host "$model is already loaded; skipping warmup."
    exit 0
}

$node = $env:ME5412_NODE_EXE
if (-not $node) { $node = Join-Path $PSScriptRoot 'runtime\node\node.exe' }
if (-not (Test-Path -LiteralPath $node -PathType Leaf)) { $node = (Get-Command node.exe -ErrorAction Stop).Source }
$warmup = Join-Path $PSScriptRoot 'start_ollama_warmup.mjs'
Write-Host "Loading $model with $contextLength-token context..."
& $node $warmup $baseUrl $model $contextLength
if ($LASTEXITCODE -ne 0) {
    throw "$model warmup failed; the course search can still start and report the model error."
}
Write-Host "$model is ready."
