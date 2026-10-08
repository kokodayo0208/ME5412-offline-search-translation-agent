$ErrorActionPreference = 'Stop'

$baseUrl = 'http://127.0.0.1:18765/'
$serverPath = Join-Path $PSScriptRoot 'server.js'
$stdoutPath = Join-Path $PSScriptRoot 'startup-server.log'
$stderrPath = Join-Path $PSScriptRoot 'startup-server-error.log'

function Test-ServerReady {
    try {
        $response = Invoke-WebRequest -Uri $baseUrl -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -eq 200 -and $response.Content -match 'ME5412'
    } catch {
        return $false
    }
}

if (Test-ServerReady) {
    Write-Host "Course search is already available at $baseUrl"
    exit 0
}

$node = (Get-Command node.exe -ErrorAction Stop).Source
$process = Start-Process -FilePath $node -ArgumentList @($serverPath) -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Seconds 1
    if (Test-ServerReady) {
        Write-Host "Course search is ready at $baseUrl (PID $($process.Id))."
        exit 0
    }
    if ($process.HasExited) {
        throw "Course search exited with code $($process.ExitCode). See $stderrPath"
    }
}
throw "Course search did not become ready within 30 seconds. See $stdoutPath and $stderrPath"
