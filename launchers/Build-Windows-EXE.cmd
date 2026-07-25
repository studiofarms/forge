@echo off
REM Builds the FrameForge Windows executables.
if /i not "%~1"=="__stay__" (
    cmd /d /k call "%~f0" __stay__
    exit /b
)

title FrameForge - Build Windows EXE
cd /d "%~dp0.."

echo(
echo  =============================================
echo   Building FrameForge Windows executables
echo  =============================================
echo(
echo  Output lands in the dist\ folder:
echo    - FrameForge-Setup-1.0.0.exe      installer
echo    - FrameForge-Portable-1.0.0.exe   single file, no install
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

call npm run dist:win
if errorlevel 1 goto :error

echo(
echo  Done! Your executables are in the dist\ folder.
goto :end

:error
echo(
echo  [!] Build failed - read the error above.

:end
echo(
