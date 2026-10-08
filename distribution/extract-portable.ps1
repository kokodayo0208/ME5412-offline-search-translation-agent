param(
  [string]$Directory = (Get-Location).Path,
  [string]$Output = (Join-Path (Get-Location).Path 'ME5412-portable')
)
$ErrorActionPreference = 'Stop'
$dir = [IO.Path]::GetFullPath($Directory)
$parts = @(Get-ChildItem -LiteralPath $dir -Filter 'ME5412-portable.zip.part*' -File | Sort-Object Name)
if (!$parts.Count) {
  $single = Join-Path $dir 'ME5412-portable.zip'
  if (!(Test-Path $single)) { throw 'No ME5412-portable.zip or numbered parts found.' }
  Expand-Archive -LiteralPath $single -DestinationPath $Output -Force
  Write-Output $Output
  exit 0
}
$expected = 1
foreach ($part in $parts) {
  if ($part.Name -notmatch '\.part(\d+)$' -or [int]$Matches[1] -ne $expected) { throw "Missing or out-of-order archive part; expected part$expected" }
  $expected++
}
$joined = Join-Path $dir 'ME5412-portable.joined.zip'
try {
  $out = [IO.File]::Open($joined, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  try { foreach ($part in $parts) { $in = [IO.File]::OpenRead($part.FullName); try { $in.CopyTo($out) } finally { $in.Dispose() } } } finally { $out.Dispose() }
  Expand-Archive -LiteralPath $joined -DestinationPath $Output -Force
} finally { Remove-Item -LiteralPath $joined -Force -ErrorAction SilentlyContinue }
Write-Output $Output
