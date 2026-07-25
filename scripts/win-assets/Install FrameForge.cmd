@echo off
REM Installs FrameForge: copies the app to your programs folder and
REM creates Desktop + Start Menu shortcuts.
if /i not "%~1"=="__stay__" (
    cmd /d /k call "%~f0" __stay__
    exit /b
)

title Install FrameForge
set "SRC=%~dp0FrameForge"
set "DEST=%LOCALAPPDATA%\Programs\FrameForge"

echo(
echo  =============================================
echo   Installing FrameForge
echo  =============================================
echo(

if not exist "%SRC%\FrameForge.exe" (
    echo  [!] The FrameForge folder is missing next to this installer.
    echo      Extract the whole zip first, then run this from inside it.
    goto :end
)

echo  Copying files to %DEST% ...
robocopy "%SRC%" "%DEST%" /E /NFL /NDL /NJH /NJS /NP >nul
if %errorlevel% GEQ 8 (
    echo  [!] Copy failed. Close FrameForge if it is running and re-run.
    goto :end
)

echo  Creating shortcuts...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws=New-Object -ComObject WScript.Shell; foreach($p in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('StartMenu')+'\Programs')){ $s=$ws.CreateShortcut($p+'\FrameForge.lnk'); $s.TargetPath='%DEST%\FrameForge.exe'; $s.WorkingDirectory='%DEST%'; $s.Description='FrameForge - AI Brand Video Studio'; $s.Save() }"

echo(
echo  Installed! FrameForge is on your Desktop and in the Start Menu.
echo  Starting it now...
start "" "%DEST%\FrameForge.exe"

:end
echo(
