$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$mongoExecutable = Join-Path $projectRoot ".local\mongodb-win32-x86_64-windows-5.0.34\bin\mongod.exe"
$dataDirectory = Join-Path $projectRoot ".local\mongodb-data"
$logDirectory = Join-Path $projectRoot ".local\mongodb-logs"
$logFile = Join-Path $logDirectory "mongod.log"

if (-not (Test-Path -LiteralPath $mongoExecutable -PathType Leaf)) {
  throw "The temporary MongoDB runtime is missing at $mongoExecutable."
}

New-Item -ItemType Directory -Path $dataDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

Write-Host "Local MongoDB is starting at mongodb://127.0.0.1:27017"
Write-Host "Press Ctrl+C to stop it. Data is stored in $dataDirectory"

& $mongoExecutable `
  --dbpath $dataDirectory `
  --bind_ip 127.0.0.1 `
  --port 27017 `
  --logpath $logFile `
  --logappend

exit $LASTEXITCODE
