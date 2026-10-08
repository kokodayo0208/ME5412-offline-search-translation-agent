param(
  [string]$Destination = (Join-Path (Split-Path $PSScriptRoot -Parent) "_portable-build\ME5412-portable"),
  [string]$NodeSource = "G:\node\node.exe",
  [string]$OllamaSource = "C:\Users\86136\AppData\Local\Programs\Ollama"
)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$appFolder = [string]::Concat("ME5412",[char]0x79bb,[char]0x7ebf,[char]0x8bfe,[char]0x4ef6,[char]0x641c,[char]0x7d22,[char]0x5668)
$notesFolder = [string]::Concat([char]0x7b14,[char]0x8bb0,[char]0x7248,[char]0x8bfe,[char]0x4ef6)
$appSource = Join-Path $root $appFolder
$noteSource = Join-Path $root $notesFolder
$dest = [IO.Path]::GetFullPath($Destination)
if (!(Test-Path $appSource)) { throw "Application source not found: $appSource" }
if (!(Test-Path $NodeSource)) { throw "Bundled Node executable not found: $NodeSource" }
if (Test-Path $dest) { throw "Refusing to overwrite existing destination: $dest" }
New-Item -ItemType Directory -Force -Path $dest | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $dest "app"),(Join-Path $dest "data"),(Join-Path $dest "runtime\node"),(Join-Path $dest "runtime\ollama"),(Join-Path $dest "scripts") | Out-Null

# Explicit allow-list: no validation results, logs, backups, assignments, or legacy app.
$appFiles = @("app.html","ask-lifecycle.js","server.js","search.js","indexer.js","package.json","package-lock.json","corrections.json","control_knowledge_audit.json","visual_supplements.json")
foreach ($name in $appFiles) { Copy-Item (Join-Path $appSource $name) (Join-Path $dest "app\$name") }
New-Item -ItemType Directory -Force -Path (Join-Path $dest "app\part2_visual"),(Join-Path $dest "app\app\part2_visual") | Out-Null
Get-ChildItem -LiteralPath (Join-Path $appSource "part2_visual") -Filter "*.json" -File | Copy-Item -Destination (Join-Path $dest "app\part2_visual") -Force
Get-ChildItem -LiteralPath (Join-Path $appSource "app\part2_visual") -Filter "*.json" -File | Copy-Item -Destination (Join-Path $dest "app\app\part2_visual") -Force
Copy-Item (Join-Path $appSource "node_modules") (Join-Path $dest "app\node_modules") -Recurse
if (!(Test-Path $noteSource)) { throw "Notes directory not found: $noteSource" }
Copy-Item $noteSource (Join-Path $dest (Join-Path "app" $notesFolder)) -Recurse
Copy-Item (Join-Path $appSource "index.json") (Join-Path $dest "app\index.source.json")
Copy-Item $NodeSource (Join-Path $dest "runtime\node\node.exe")
Copy-Item (Join-Path $PSScriptRoot "portable-start.ps1") (Join-Path $dest "Start-ME5412.ps1")
Copy-Item (Join-Path $PSScriptRoot "Start-ME5412.cmd") (Join-Path $dest "Start-ME5412.cmd")
Copy-Item (Join-Path $PSScriptRoot "setup-model.mjs") (Join-Path $dest "scripts\setup-model.mjs")
Copy-Item (Join-Path $PSScriptRoot "setup-model.cmd") (Join-Path $dest "setup-model.cmd")
Copy-Item (Join-Path $PSScriptRoot "extract-portable.ps1") (Join-Path $dest "extract-portable.ps1")
Copy-Item (Join-Path $PSScriptRoot "model-release.json") (Join-Path $dest "model-release.json")
Copy-Item (Join-Path $PSScriptRoot "README.md") (Join-Path $dest "README.md")
Copy-Item (Join-Path $PSScriptRoot "NODE-RUNTIME-NOTICE.txt") (Join-Path $dest "runtime\node\NODE-RUNTIME-NOTICE.txt")

# Make the checked-in index portable: paths are relative to app\ and folder is '.'.
$node = Join-Path $dest "runtime\node\node.exe"
& $node (Join-Path $PSScriptRoot "rewrite-index.mjs") (Join-Path $dest "app\index.source.json") (Join-Path $dest "app\index.json")
if ($LASTEXITCODE -ne 0) { throw "Portable index rewrite failed" }
Remove-Item (Join-Path $dest "app\index.source.json") -Force

$ollamaDestination = Join-Path (Join-Path $dest "runtime") "ollama"
$ollamaExists = Test-Path (Join-Path $OllamaSource "ollama.exe")
if (-not $ollamaExists) { throw "Ollama executable missing" }
Get-ChildItem -LiteralPath $OllamaSource -Force | Copy-Item -Destination $ollamaDestination -Recurse -Force
Write-Output $dest
