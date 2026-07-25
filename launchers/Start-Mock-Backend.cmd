@echo off
REM Starts the mock ComfyUI backend for GPU-free testing.
if /i not "%~1"=="__stay__" (
    cmd /d /k call "%~f0" __stay__
    exit /b
)

title FrameForge - Mock GPU Backend
cd /d "%~dp0.."

echo(
echo  Starting the mock ComfyUI backend on http://127.0.0.1:8188
echo  Paste that URL into FrameForge - Connect to test the whole
echo  generate flow without a real GPU. Renders return placeholder
echo  files after about 6 seconds.
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
    if errorlevel 1 goto :end
)

call npm run mock-comfy

:end
echo(
