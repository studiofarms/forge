@echo off
REM Removes FrameForge and its shortcuts. Your brand kits and gallery
REM live in your browser profile and are not touched.
if /i not "%~1"=="__stay__" (
    cmd /d /k call "%~f0" __stay__
    exit /b
)

title Uninstall FrameForge
set "DEST=%LOCALAPPDATA%\Programs\FrameForge"

echo(
echo  Removing FrameForge...
taskkill /f /im FrameForge.exe >nul 2>nul
rmdir /s /q "%DEST%" 2>nul
powershell -NoProfile -Command "foreach($p in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('StartMenu')+'\Programs')){ Remove-Item -ErrorAction SilentlyContinue ($p+'\FrameForge.lnk') }"
echo  Done.
echo(
