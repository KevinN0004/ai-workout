$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$serverRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$pgBin = $env:POSTGRES_BIN_DIR
if (-not $pgBin) {
  $candidateVersions = @("18", "17", "16")
  foreach ($version in $candidateVersions) {
    $candidate = "C:\Program Files\PostgreSQL\$version\bin"
    if (Test-Path (Join-Path $candidate "postgres.exe")) {
      $pgBin = $candidate
      break
    }
  }
}

if (-not $pgBin -or -not (Test-Path (Join-Path $pgBin "postgres.exe"))) {
  throw "Could not find postgres.exe. Set POSTGRES_BIN_DIR to your PostgreSQL bin directory."
}

$dataDir = Join-Path $repoRoot ".postgres-data"
$pwFile = Join-Path $repoRoot ".postgres-pw"
$port = if ($env:LOCAL_POSTGRES_PORT) { [int]$env:LOCAL_POSTGRES_PORT } else { 55432 }
$database = if ($env:LOCAL_POSTGRES_DATABASE) { $env:LOCAL_POSTGRES_DATABASE } else { "ai_workout" }
$user = "postgres"

if (-not (Test-Path $pwFile)) {
  $password = "ai_workout_$([guid]::NewGuid().ToString("N").Substring(0, 16))"
  Set-Content -LiteralPath $pwFile -Value $password -NoNewline
} else {
  $password = Get-Content -Raw -LiteralPath $pwFile
}

if (-not (Test-Path $dataDir)) {
  & (Join-Path $pgBin "initdb.exe") -D $dataDir -U $user --auth=scram-sha-256 --pwfile=$pwFile
  if ($LASTEXITCODE -ne 0) {
    throw "initdb failed."
  }
}

$alreadyListening = Test-NetConnection -ComputerName 127.0.0.1 -Port $port -InformationLevel Quiet -WarningAction SilentlyContinue
if (-not $alreadyListening) {
  Start-Process `
    -FilePath (Join-Path $pgBin "postgres.exe") `
    -ArgumentList @("-D", $dataDir, "-p", "$port") `
    -RedirectStandardOutput (Join-Path $dataDir "postgres.stdout.log") `
    -RedirectStandardError (Join-Path $dataDir "postgres.stderr.log") `
    -WindowStyle Hidden
}

$started = $false
for ($i = 0; $i -lt 20; $i += 1) {
  & (Join-Path $pgBin "pg_isready.exe") -h 127.0.0.1 -p $port -U $user -d postgres *> $null
  if ($LASTEXITCODE -eq 0) {
    $started = $true
    break
  }
  Start-Sleep -Milliseconds 500
}

if (-not $started) {
  throw "Local Postgres did not start on 127.0.0.1:$port."
}

$env:PGPASSWORD = $password
try {
  & (Join-Path $pgBin "createdb.exe") -h 127.0.0.1 -p $port -U $user $database *> $null
} catch {
  # createdb exits non-zero when the database already exists; the migration step will verify access.
}

$databaseUrl = "postgresql://${user}:$password@127.0.0.1:$port/$database"
$envPath = Join-Path $serverRoot ".env"
$lines = if (Test-Path $envPath) { Get-Content -LiteralPath $envPath } else { @() }
$found = $false
$updatedLines = foreach ($line in $lines) {
  if ($line -match "^DATABASE_URL=") {
    $found = $true
    "DATABASE_URL=$databaseUrl"
  } else {
    $line
  }
}
if (-not $found) {
  $updatedLines += "DATABASE_URL=$databaseUrl"
}
Set-Content -LiteralPath $envPath -Value $updatedLines

Write-Output "Local Postgres is running at postgresql://postgres:redacted@127.0.0.1:$port/$database"
