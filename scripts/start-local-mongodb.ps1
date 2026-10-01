$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$mongoExecutable = Join-Path $projectRoot ".local\mongodb-win32-x86_64-windows-5.0.34\bin\mongod.exe"
$dataDirectory = Join-Path $projectRoot ".local\mongodb-data"
$logDirectory = Join-Path $projectRoot ".local\mongodb-logs"
$logFile = Join-Path $logDirectory "mongod.log"
$initScript = Join-Path $PSScriptRoot "init-local-mongodb.mjs"

if (-not (Test-Path -LiteralPath $mongoExecutable -PathType Leaf)) {
  throw "The temporary MongoDB runtime is missing at $mongoExecutable."
}
New-Item -ItemType Directory -Path $dataDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$ownedMongoProcess = $null
try {
  $existingListener = Get-NetTCPConnection -LocalPort 27017 -State Listen -ErrorAction SilentlyContinue
  if (-not $existingListener) {
    $mongoArguments = @("--dbpath", ('"' + $dataDirectory + '"'), "--bind_ip", "127.0.0.1", "--port", "27017",
      "--replSet", "g4-local", "--storageEngine", "wiredTiger", "--logpath", ('"' + $logFile + '"'), "--logappend")
    $ownedMongoProcess = Start-Process -FilePath $mongoExecutable -ArgumentList $mongoArguments -WindowStyle Hidden -PassThru
  }
  & node $initScript
  if ($LASTEXITCODE -ne 0) { throw "Local MongoDB initialization failed. See the message above." }
  Write-Host "MongoDB: mongodb://127.0.0.1:27017/?replicaSet=g4-local"
  if ($ownedMongoProcess) {
    Write-Host "Press Ctrl+C to stop this MongoDB process. Data is stored in $dataDirectory"
    Wait-Process -Id $ownedMongoProcess.Id
  } else {
    Write-Host "Using the existing replica set on port 27017."
  }
} finally {
  if ($ownedMongoProcess -and -not $ownedMongoProcess.HasExited) {
    Stop-Process -Id $ownedMongoProcess.Id
  }
}
