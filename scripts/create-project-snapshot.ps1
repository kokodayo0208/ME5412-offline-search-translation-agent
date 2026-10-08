[CmdletBinding()]
param([string]$Root = (Get-Location).Path)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$rootPath = [IO.Path]::GetFullPath($Root)
$outDir = Join-Path $rootPath '.project-backup-release'
$archive = Join-Path $outDir 'ME5412-project-snapshot.zip'
$manifestPath = Join-Path $outDir 'ME5412-project-snapshot.manifest.json'
$tmp = "$archive.tmp"
$secretName = [regex]'(?i)(^|\.)(env|env\..*)$|(^|[-_.])(token|tokens|secret|secrets|credential|credentials|auth|oauth|passwd|password|private[-_.]?key)([-_.]|$)'
$secretLine = [regex]'(?i)(api[_-]?key|access[_-]?key|secret[_-]?key|auth(?:orization)?|bearer|password|passwd|private[_-]?key|client[_-]?secret|refresh[_-]?token)\s*[:=]\s*(["'']?)[A-Za-z0-9_./+:-]{12,}\2'
$falsePositive = [regex]'(?i)\b(tokenizer|tokenizers|tokenization|token\s+budget|token\s+count)\b'
$textExt = @('.bat','.cmd','.conf','.config','.csv','.env','.ini','.js','.json','.log','.md','.mjs','.ps1','.py','.sh','.sql','.txt','.toml','.ts','.tsx','.yaml','.yml','.xml')
function Rel([string]$p) {
  $base = [Uri](([IO.Path]::GetFullPath($rootPath).TrimEnd('\') + '\'))
  return [Uri]::UnescapeDataString($base.MakeRelativeUri([Uri]([IO.Path]::GetFullPath($p))).ToString()).Replace('\','/')
}
function Reason([IO.FileInfo]$f) {
  $r = Rel $f.FullName; $first = ($r -split '/')[0]
  if ($first -eq '.git') { return '.git metadata' }
  if ($first -in @('.model-backup-release','.project-backup-release')) { return $first }
  if ($secretName.IsMatch($f.Name)) { return 'credential-like filename' }
  return $null
}
if (Test-Path $tmp) { Remove-Item -LiteralPath $tmp -Force }
$files = [Collections.Generic.List[IO.FileInfo]]::new(); $omissions = [Collections.Generic.List[object]]::new()
foreach ($f in Get-ChildItem -LiteralPath $rootPath -Force -File -Recurse) {
  $why = Reason $f
  if ($why) { $omissions.Add([ordered]@{path=(Rel $f.FullName); reason=$why}); continue }
  if ($f.LinkType) {
    $target = [IO.Path]::GetFullPath($f.Target)
    if (-not ($target.StartsWith($rootPath + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase))) { throw "symlink outside workspace refused: $(Rel $f.FullName) -> $target" }
    $omissions.Add([ordered]@{path=(Rel $f.FullName); reason='in-workspace symlink not archived as file'}); continue
  }
  $files.Add($f)
}
$files = @($files | Sort-Object { (Rel $_.FullName).ToLowerInvariant() })
$findings = [Collections.Generic.List[object]]::new()
foreach ($o in $omissions) { if ($o.reason -eq 'credential-like filename') { $findings.Add([ordered]@{path=$o.path; kind='excluded filename'}) } }
foreach ($f in $files) {
  # Vendored/generated dependency bundles contain ordinary identifiers such as
  # accessKey/password and are not project credential sources; archive them,
  # but omit them from the human-facing credential scan.
  if ((Rel $f.FullName) -match '(^|/)node_modules/') { continue }
  if (($textExt -notcontains $f.Extension.ToLowerInvariant()) -or $f.Length -gt 8MB) { continue }
  try { $lines = [IO.File]::ReadAllLines($f.FullName) } catch { continue }
  for ($i=0; $i -lt $lines.Count; $i++) {
    if ($falsePositive.IsMatch($lines[$i]) -and -not $secretLine.IsMatch($lines[$i])) { continue }
    if ($secretLine.IsMatch($lines[$i])) { $findings.Add([ordered]@{path=(Rel $f.FullName); line=$i+1; kind='likely secret syntax'}) }
  }
}
$uniq = @{}; foreach ($x in $findings) { $key = "$($x.path)|$($x.line)|$($x.kind)"; $uniq[$key] = $x }
$findings = @($uniq.Values | Sort-Object path,line)
New-Item -ItemType Directory -Path $outDir -Force | Out-Null
$outStream = [IO.File]::Open($tmp, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
$zip = [IO.Compression.ZipArchive]::new($outStream, [IO.Compression.ZipArchiveMode]::Create, $false)
$sourceBytes = [int64]0
try {
  foreach ($f in $files) {
    $entry = $zip.CreateEntry((Rel $f.FullName), [IO.Compression.CompressionLevel]::Optimal)
    $input = [IO.File]::OpenRead($f.FullName); $dest = $entry.Open()
    try { $input.CopyTo($dest, 8MB); $sourceBytes += $f.Length } finally { $dest.Dispose(); $input.Dispose() }
  }
} finally { $zip.Dispose(); $outStream.Dispose() }
Move-Item -LiteralPath $tmp -Destination $archive -Force
$sha = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
$crcArchive = [IO.Compression.ZipFile]::OpenRead($archive)
$crcBad = $null; $entryCount = $crcArchive.Entries.Count; $nullStream = [IO.Stream]::Null
try { foreach ($e in $crcArchive.Entries) { $s=$e.Open(); try { $s.CopyTo($nullStream, 8MB) } catch { $crcBad=$e.FullName; break } finally { $s.Dispose() } } } finally { $crcArchive.Dispose() }
if ($crcBad) { throw "archive validation failed while reading $crcBad" }
$validation = [ordered]@{archive_sha256=$sha; archive_bytes=(Get-Item $archive).Length; uncompressed_bytes=$sourceBytes; file_count=$files.Count; zip_entries_verified=$entryCount; crc_test='passed'}
$manifest = [ordered]@{format='ME5412 project snapshot release asset'; workspace_root=$rootPath; archive=$archive; source_file_count=$files.Count; source_bytes=$sourceBytes; exclusions=@($omissions); credential_scan=[ordered]@{policy='likely credential paths/line numbers only; values never recorded'; findings=$findings}; validation=$validation; restore_guide=@('Extract the ZIP into the intended ME5412 workspace root, preserving relative paths.','The archive intentionally excludes .git, .model-backup-release, .project-backup-release, and credential-like files.','Do not extract over a live workspace without reviewing exclusions and conflicts first.','Model weights are restored separately from .model-backup-release using the model restoration guide.')}
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
[ordered]@{archive=$archive; manifest=$manifestPath; file_count=$files.Count; archive_bytes=$validation.archive_bytes; source_bytes=$sourceBytes; archive_sha256=$sha; omissions=$omissions.Count; credential_findings=$findings.Count; crc_test='passed'} | ConvertTo-Json -Compress
