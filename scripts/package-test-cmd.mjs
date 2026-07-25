#!/usr/bin/env node
// Packages the standalone mock backend into one self-extracting Windows .cmd:
//
//   node scripts/package-test-cmd.mjs  →  release/FrameForge-TestBackend.cmd
//
// Double-clicked, it extracts the zero-dependency mock ComfyUI server and runs
// it with Node from PATH, or — if the machine has no Node — silently fetches a
// portable node.exe (official nodejs.org zip) into %LOCALAPPDATA%\FrameForge.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'scripts', 'mock-comfy-standalone.mjs');
const RELEASE_DIR = path.join(ROOT, 'release');
const TARGET = path.join(RELEASE_DIR, 'FrameForge-TestBackend.cmd');

const NODE_VERSION = 'v20.18.1';
const NODE_DIRNAME = `node-${NODE_VERSION}-win-x64`;
const NODE_URL = `https://nodejs.org/dist/${NODE_VERSION}/${NODE_DIRNAME}.zip`;

const source = fs.readFileSync(SRC);
const stamp = crypto.createHash('sha256').update(source).digest('hex').slice(0, 12);
const b64 = source.toString('base64').replace(/(.{76})/g, '$1\n');

const batch = `@echo off
REM ===========================================================
REM  FrameForge TEST backend (fake GPU) - all-in-one launcher
REM  Simulates the ComfyUI GPU server so you can test the full
REM  generate flow with no GPU. Renders return placeholder
REM  files after ~6 seconds. Build stamp: ${stamp}
REM ===========================================================
if /i not "%~1"=="__stay__" (
    cmd /d /k call "%~f0" __stay__
    exit /b
)

title FrameForge - Test GPU Backend
set "APPDIR=%LOCALAPPDATA%\\FrameForge"
if not exist "%APPDIR%" mkdir "%APPDIR%" >nul 2>nul

echo(
echo  =============================================
echo   FrameForge - Test GPU Backend (fake GPU)
echo  =============================================

if exist "%APPDIR%\\backend-${stamp}.ok" goto :findnode
echo(
echo  Unpacking the test backend...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$t=[IO.File]::ReadAllText('%~f0'); $p=($t -split ('::PAYLOAD-'+'BEGIN::'))[1] -split ('::PAYLOAD-'+'END::'); [IO.File]::WriteAllBytes('%APPDIR%\\mock-backend.mjs', [Convert]::FromBase64String(($p[0] -replace '\\s','')))"
if not exist "%APPDIR%\\mock-backend.mjs" (
    echo  [!] Could not unpack the embedded backend. Re-download this file.
    goto :end
)
type nul > "%APPDIR%\\backend-${stamp}.ok"

:findnode
set "NODE="
where node >nul 2>nul && set "NODE=node"
if not defined NODE if exist "%APPDIR%\\node\\node.exe" set "NODE=%APPDIR%\\node\\node.exe"
if defined NODE goto :serve

echo(
echo  Node.js not found - fetching a portable copy (~30 MB, one time,
echo  official nodejs.org download, nothing is installed)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing '${NODE_URL}' -OutFile '%APPDIR%\\node.zip'"
if not exist "%APPDIR%\\node.zip" (
    echo  [!] Download failed - check your internet connection and re-run.
    goto :end
)
tar -xf "%APPDIR%\\node.zip" -C "%APPDIR%" >nul 2>nul
if not exist "%APPDIR%\\${NODE_DIRNAME}\\node.exe" (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Force '%APPDIR%\\node.zip' '%APPDIR%'"
)
if not exist "%APPDIR%\\${NODE_DIRNAME}\\node.exe" (
    echo  [!] Could not extract Node. Re-run to try again.
    goto :end
)
if exist "%APPDIR%\\node" rmdir /s /q "%APPDIR%\\node" >nul 2>nul
move "%APPDIR%\\${NODE_DIRNAME}" "%APPDIR%\\node" >nul
del "%APPDIR%\\node.zip" >nul 2>nul
set "NODE=%APPDIR%\\node\\node.exe"

:serve
echo(
"%NODE%" "%APPDIR%\\mock-backend.mjs"

:end
echo(
exit /b

::PAYLOAD-BEGIN::
${b64}
::PAYLOAD-END::
`;

fs.mkdirSync(RELEASE_DIR, { recursive: true });
fs.writeFileSync(TARGET, batch.replace(/\n/g, '\r\n'));
const size = fs.statSync(TARGET).size;
console.log(`✓ ${path.relative(ROOT, TARGET)} (${(size / 1024).toFixed(0)} KB, stamp ${stamp})`);
