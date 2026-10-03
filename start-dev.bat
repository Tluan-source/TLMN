@echo off
setlocal
title TLMN dev
cd /d "%~dp0"

set "PG_BIN=%ProgramFiles%\PostgreSQL\16\bin"

where node >nul 2>&1 || (echo [Loi] Chua cai Node.js LTS. & goto :fail)
if not exist "%PG_BIN%\pg_ctl.exe" (echo [Loi] Khong tim thay PostgreSQL 16 tai "%PG_BIN%". & goto :fail)
if not exist ".env" (echo [Loi] Thieu file .env. Sao chep tu .env.example roi dien gia tri. & goto :fail)

echo [1/4] Khoi dong PostgreSQL local (cong 5433)...
"%PG_BIN%\pg_isready.exe" -h 127.0.0.1 -p 5433 >nul 2>&1
if errorlevel 1 (
  if not exist ".local-postgres\PG_VERSION" (
    echo [Loi] Chua khoi tao database. Chay scripts\start-local-postgres.ps1 bang PowerShell 7 lan dau.
    goto :fail
  )
  "%PG_BIN%\pg_ctl.exe" -D ".local-postgres" -o "-p 5433 -h 127.0.0.1" -l ".local-postgres.log" -w start
  if errorlevel 1 (echo [Loi] Khong khoi dong duoc PostgreSQL. Xem .local-postgres.log. & goto :fail)
) else (
  echo     PostgreSQL da chay san.
)

echo [2/4] Cai dependency neu can...
if not exist "node_modules" (
  call npm install || goto :fail
) else (
  echo     Da co node_modules, bo qua.
)

echo [3/4] Cap nhat Prisma client va database...
call npm run db:generate || goto :fail
pushd apps\api
call npx prisma migrate deploy
if errorlevel 1 (popd & goto :fail)
popd

echo [4/4] Chay app: http://localhost:3000  (Ctrl+C de dung)
start "" cmd /c "timeout /t 12 /nobreak >nul & start http://localhost:3000"
call npm run dev
goto :eof

:fail
echo.
echo Khong chay duoc du an. Xem loi o tren.
pause
exit /b 1
