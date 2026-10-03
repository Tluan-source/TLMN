param(
  [string]$Password = 'journal_local_only'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$dataDirectory = Join-Path $projectRoot '.local-postgres'
$logPath = Join-Path $projectRoot '.local-postgres.log'
$postgresBin = Join-Path $env:ProgramFiles 'PostgreSQL\16\bin'
$initDb = Join-Path $postgresBin 'initdb.exe'
$pgCtl = Join-Path $postgresBin 'pg_ctl.exe'
$pgIsReady = Join-Path $postgresBin 'pg_isready.exe'
$createdb = Join-Path $postgresBin 'createdb.exe'
$passwordFile = Join-Path $env:TEMP "journal-init-$([guid]::NewGuid().ToString('N')).txt"

if (-not (Test-Path -LiteralPath $pgCtl)) {
  throw 'Không tìm thấy PostgreSQL 16. Hãy cài PostgreSQL 16 hoặc dùng Docker Compose.'
}

if (-not (Test-Path -LiteralPath (Join-Path $dataDirectory 'PG_VERSION'))) {
  if (Test-Path -LiteralPath $dataDirectory) {
    throw "Thư mục dữ liệu chưa khởi tạo: $dataDirectory. Không xóa tự động để tránh mất dữ liệu."
  }
  try {
    Set-Content -LiteralPath $passwordFile -Value $Password -Encoding Ascii -NoNewline
    & $initDb -D $dataDirectory -U journal --pwfile=$passwordFile --auth=scram-sha-256 --encoding=UTF8
    if ($LASTEXITCODE -ne 0) { throw 'Không khởi tạo được PostgreSQL local.' }
  }
  finally {
    Remove-Item -LiteralPath $passwordFile -Force -ErrorAction SilentlyContinue
  }
}

& $pgCtl -D $dataDirectory status *> $null
if ($LASTEXITCODE -ne 0) {
  & $pgCtl -D $dataDirectory -o '-p 5433 -h 127.0.0.1' -l $logPath start
  if ($LASTEXITCODE -ne 0) { throw 'Không khởi động được PostgreSQL local. Xem .local-postgres.log.' }
}

$previousPassword = $env:PGPASSWORD
try {
  $env:PGPASSWORD = $Password
  & $pgIsReady -h 127.0.0.1 -p 5433 -U journal
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL chưa sẵn sàng trên cổng 5433.' }
  & $createdb -h 127.0.0.1 -p 5433 -U journal journal 2>$null
  if ($LASTEXITCODE -ne 0) {
    & (Join-Path $postgresBin 'psql.exe') -h 127.0.0.1 -p 5433 -U journal -d journal -w -c 'SELECT 1;' *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Không kết nối được database journal. Kiểm tra mật khẩu trong .env.' }
  }
}
finally {
  $env:PGPASSWORD = $previousPassword
}

Write-Output 'PostgreSQL local sẵn sàng tại 127.0.0.1:5433.'
