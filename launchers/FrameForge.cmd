@echo off
REM FrameForge launcher - double-click to run.
REM Relaunch inside a persistent console so errors never vanish instantly.
if /i not "%~1"=="__stay__" (
    cmd /d /k call "%~f0" __stay__
    exit /b
)

title FrameForge - AI Brand Video Studio
cd /d "%~dp0.."

echo(
echo  =============================================
echo   FrameForge - AI Brand Video Studio
echo  =============================================
echo(

if not exist "package.json" (
    echo  [!] Cannot find package.json one folder above this launcher.
    echo      Keep this .cmd inside the frameforge\launchers folder of the repo
    echo      and run it from there.
    goto :end
)

where node >nul 2>nul
if errorlevel 1 (
    echo  [!] Node.js is not installed or not on your PATH.
    echo      Install the LTS from https://nodejs.org then re-run this launcher.
    goto :end
)

if not exist "node_modules" (
    echo  [1/3] Installing dependencies - first run only, takes a minute...
    call npm install --no-audit --no-fund
    if errorlevel 1 goto :error
)

if not exist "out\index.html" (
    echo  [2/3] Building the app - first run only...
    call npm run build
    if errorlevel 1 goto :error
)

echo  [3/3] Starting FrameForge at http://localhost:3999
echo        Keep this window open while you use the app.
echo(
start "" "http://localhost:3999"
call npx --yes serve out -l 3999
goto :end

:error
echo(
echo  [!] Something went wrong - read the error above, fix it, re-run.

:end
echo(
