@echo off
REM ---------------------------------------------------------------
REM  STRATA - one-click start on Windows (local AI, no cloud)
REM  Double-click this file. First run needs internet (install +
REM  model download, about 1 GB). After that it works offline.
REM ---------------------------------------------------------------
setlocal
cd /d "%~dp0"
title STRATA - local mine safety dashboard

if "%OLLAMA_MODEL%"=="" set OLLAMA_MODEL=qwen2.5:1.5b

REM Memory settings for an 8 GB computer. They apply when this script
REM starts Ollama itself; to make them permanent see README section
REM "Running on an 8 GB computer".
set OLLAMA_NUM_PARALLEL=1
set OLLAMA_MAX_LOADED_MODELS=1
set OLLAMA_FLASH_ATTENTION=1
set OLLAMA_KV_CACHE_TYPE=q8_0

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install Node.js 22 LTS from https://nodejs.org then run this again.
  pause
  exit /b 1
)
where ollama >nul 2>nul
if errorlevel 1 (
  echo Ollama is not installed. Install it from https://ollama.com/download/windows then run this again.
  pause
  exit /b 1
)

curl -s -o nul http://127.0.0.1:11434/api/version
if errorlevel 1 (
  echo Starting Ollama ...
  start "Ollama" /min ollama serve
  timeout /t 5 /nobreak >nul
)

ollama list | findstr /i /c:"%OLLAMA_MODEL%" >nul
if errorlevel 1 (
  echo Downloading the AI model %OLLAMA_MODEL% - one time only ...
  ollama pull %OLLAMA_MODEL%
  if errorlevel 1 goto :fail
)

if not exist node_modules (
  echo Installing app dependencies - one time only ...
  call npm ci
  if errorlevel 1 goto :fail
)

REM Always rebuild, so edits to src\config\site-thresholds.json take effect.
echo Building the app ...
call npm run build
if errorlevel 1 goto :fail

echo.
echo STRATA is starting at http://127.0.0.1:8080  (close this window to stop it)
echo The GitHub Pages edition can also use this local AI while it runs.
start "" cmd /c "timeout /t 4 /nobreak >nul & start http://127.0.0.1:8080"
call npm run start:with-pages
goto :eof

:fail
echo.
echo Something went wrong above. Run "npm run doctor" in this folder for a checklist.
pause
exit /b 1
