@echo off
REM FrameForge desktop (Electron) launcher.
if /i not "%~1"=="__stay__" (
    cmd /d /k call "%~f0" __stay__
    exit /b
)

title FrameForge Desktop
cd /d "%~dp0.."

echo(
echo  Launching FrameForge as a desktop app...
echo  First run downloads Electron - give it a minute.
echo(

if not exist "package.json" (
    echo  [!] Cannot find package.json - keep this .cmd inside frameforge\launchers.
    goto :end
)

where node >nul 2>nul
if errorlevel 1 (
    echo  [!] Node.js is not installed. Get the LTS from https://nodejs.org
    goto :end
)

if not exist "node_modules" (
    call npm install --no-audit --no-fund
    if errorlevel 1 goto :error
)

call npm run desktop
if errorlevel 1 goto :error
goto :end

:error
echo(
echo  [!] Launch failed - read the error above.

:end
echo(
