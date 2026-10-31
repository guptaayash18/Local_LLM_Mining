@echo off
REM ---------------------------------------------------------------
REM  HazardWatch - one-click start on Windows (local AI, no cloud)
REM  Double-click this file. Keep this window open while you use
REM  the app; close it to stop. First run needs internet.
REM ---------------------------------------------------------------
setlocal
cd /d "%~dp0"
title HazardWatch - mine environment and hazard monitor
echo.
echo  HazardWatch - starting from: %CD%
echo.

if "%OLLAMA_MODEL%"=="" set OLLAMA_MODEL=qwen2.5:1.5b
REM No time limit for the AI report: it always finishes (OLLAMA_TIMEOUT_MS unset).

REM Memory settings for an 8 GB computer (used when this script starts Ollama).
set OLLAMA_NUM_PARALLEL=1
set OLLAMA_MAX_LOADED_MODELS=1
set OLLAMA_FLASH_ATTENTION=1
set OLLAMA_KV_CACHE_TYPE=q8_0

REM ---- 1. Node.js (required) -----------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo  [X] Node.js was not found. Install Node.js 22 LTS from https://nodejs.org
  echo      then restart the computer and run this file again.
  goto :fail
)
for /f "tokens=1 delims=v." %%v in ('node -v') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 22 (
  echo  [X] Node.js is too old ^(found:
  node -v
  echo      ^). Install Node.js 22 LTS from https://nodejs.org and run this again.
  goto :fail
)
echo  [OK] Node.js
node -v

REM ---- 2. Ollama + model (optional: the dashboard works without it)
set OLLAMA_EXE=ollama
where ollama >nul 2>nul
if errorlevel 1 if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" set OLLAMA_EXE="%LOCALAPPDATA%\Programs\Ollama\ollama.exe"
%OLLAMA_EXE% --version >nul 2>nul
if errorlevel 1 (
  echo  [!] Ollama not found. The dashboard will work, but without the AI report.
  echo      Install it from https://ollama.com/download/windows to add the AI.
  goto :app
)
curl -s -o nul http://127.0.0.1:11434/api/version
if errorlevel 1 (
  echo  [..] Starting Ollama
  start "Ollama" /min %OLLAMA_EXE% serve
  timeout /t 5 /nobreak >nul
)
echo  [OK] Ollama
%OLLAMA_EXE% list 2>nul | findstr /i /c:"%OLLAMA_MODEL%" >nul
if errorlevel 1 (
  echo  [..] The AI model %OLLAMA_MODEL% is not downloaded yet. Downloading it in a
  echo       separate window ^(about 1 GB, one time^). The dashboard starts meanwhile.
  start "Downloading AI model" cmd /k %OLLAMA_EXE% pull %OLLAMA_MODEL%
) else (
  echo  [OK] AI model %OLLAMA_MODEL%
)

:app
REM ---- 3. App ----------------------------------------------------
if not exist node_modules (
  echo  [..] Installing app dependencies ^(one time, needs internet, 1-3 min^)
  call npm ci --no-audit --no-fund
  if errorlevel 1 (
    echo  [X] Installing dependencies failed. Check the internet connection and try again.
    goto :fail
  )
)
echo  [..] Building the app ^(about 30 s^)
call npm run build
if errorlevel 1 (
  echo  [X] The build failed - see the messages above.
  goto :fail
)

echo.
echo  =============================================================
echo   HazardWatch is running:  http://127.0.0.1:8080
echo   Keep this window open. Close it to stop the app.
echo  =============================================================
echo.
start "" cmd /c "timeout /t 5 /nobreak >nul & start http://127.0.0.1:8080"
call npm run start:with-pages
echo.
echo  The app stopped. If it says the port is in use, close the other
echo  HazardWatch window, or restart the computer, then run this again.
goto :fail

:fail
echo.
echo  For a full checklist run:  npm run doctor   ^(in this folder^)
pause
exit /b 1
