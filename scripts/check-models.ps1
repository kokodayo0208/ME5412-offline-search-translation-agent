[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string[]] $Required,
    [string[]] $Optional = @()
)

$ErrorActionPreference = 'Stop'
$ollama = Get-Command ollama -ErrorAction SilentlyContinue
if (-not $ollama) {
    Write-Error 'Ollama was not found on PATH. Install it separately, then rerun this read-only check.'
}

$json = & $ollama.Source list 2>$null | ConvertFrom-Json
$installed = @($json.models | ForEach-Object { [string]$_.name })
foreach ($tag in $Required) {
    if ($installed -contains $tag) { Write-Host "OK required: $tag" }
    else { Write-Host "MISSING required: $tag"; $global:LASTEXITCODE = 1 }
}
foreach ($tag in $Optional) {
    if ($installed -contains $tag) { Write-Host "OK optional: $tag" }
    else { Write-Host "absent optional: $tag" }
}
Write-Host 'No download or model-store mutation was performed.'
