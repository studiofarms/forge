#!/usr/bin/env node
// Packages the ENTIRE built app into one self-extracting Windows .cmd file.
//
//   npm run package:cmd   →  release/FrameForge-AllInOne.cmd
//
// The output is a batch script with the built static site (out/) zipped and
// base64-embedded after an exit line. Double-clicked on any Windows 10/11 PC
// it extracts itself to %LOCALAPPDATA%\FrameForge and serves the app with the
// built-in PowerShell — no Node.js, no npm, no installs of any kind.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'out');
const RELEASE_DIR = path.join(ROOT, 'release');
const TARGET = path.join(RELEASE_DIR, 'FrameForge-AllInOne.cmd');

if (!fs.existsSync(path.join(OUT, 'index.html'))) {
  console.error('out/index.html not found — run "npm run build" first.');
  process.exit(1);
}

// ── Static file server, written in PowerShell so stock Windows can run it ──
const SERVER_PS1 = `param([string]$Root = "$PSScriptRoot\\app", [int]$Port = 3999)
$ErrorActionPreference = 'Stop'
$mime = @{
  '.html'='text/html; charset=utf-8'; '.js'='text/javascript'; '.css'='text/css'
  '.json'='application/json'; '.svg'='image/svg+xml'; '.png'='image/png'
  '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'; '.gif'='image/gif'; '.ico'='image/x-icon'
  '.woff2'='font/woff2'; '.woff'='font/woff'; '.txt'='text/plain'
  '.webmanifest'='application/manifest+json'; '.webp'='image/webp'
}
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
try { $listener.Start() } catch {
  Write-Host ""
  Write-Host " [!] Port $Port is already in use - is FrameForge already running?"
  Write-Host "     Close the other window or open http://127.0.0.1:$Port directly."
  exit 1
}
$rootFull = (Resolve-Path $Root).Path
Write-Host ""
Write-Host " FrameForge is running:  http://127.0.0.1:$Port"
Write-Host " Keep this window open while you use the app. Close it to stop."
Write-Host ""
while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response
    $rel = [Uri]::UnescapeDataString($req.Url.AbsolutePath).TrimStart('/') -replace '/', '\\'
    if ($rel -eq '') { $rel = 'index.html' }
    $base = Join-Path $Root $rel
    $file = $null
    foreach ($c in @($base, (Join-Path $base 'index.html'), ($base.TrimEnd('\\') + '.html'))) {
      if (Test-Path -LiteralPath $c -PathType Leaf) { $file = $c; break }
    }
    if ($file) {
      $full = (Resolve-Path -LiteralPath $file).Path
      if (-not $full.StartsWith($rootFull)) { $file = $null }
    }
    if (-not $file) {
      $nf = Join-Path $Root '404.html'
      if (Test-Path -LiteralPath $nf -PathType Leaf) { $file = $nf }
      $res.StatusCode = 404
    }
    if ($file) {
      $bytes = [IO.File]::ReadAllBytes($file)
      $ext = [IO.Path]::GetExtension($file).ToLower()
      if ($mime.ContainsKey($ext)) { $res.ContentType = $mime[$ext] }
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    }
    $res.Close()
  } catch { }
}
`;

// ── Collect out/ into a zip: app/** + server.ps1 ───────────────────────────
const zip = new JSZip();
zip.file('server.ps1', SERVER_PS1.replace(/\n/g, '\r\n'));

function addDir(dir, zipPath) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = `${zipPath}/${entry.name}`;
    if (entry.isDirectory()) addDir(abs, rel);
    else zip.file(rel, fs.readFileSync(abs));
  }
}
addDir(OUT, 'app');

const zipBuffer = await zip.generateAsync({
  type: 'nodebuffer',
  compression: 'DEFLATE',
  compressionOptions: { level: 9 },
});
const stamp = crypto.createHash('sha256').update(zipBuffer).digest('hex').slice(0, 12);
const b64 = zipBuffer.toString('base64').replace(/(.{76})/g, '$1\n');

// ── Batch wrapper ──────────────────────────────────────────────────────────
const batch = `@echo off
REM ===========================================================
REM  FrameForge - AI Brand Video Studio  (all-in-one launcher)
REM  The entire app is embedded in this file. Requirements: a
REM  stock Windows 10/11 PC. No Node.js, no installs, nothing.
REM  Build stamp: ${stamp}
REM ===========================================================
if /i not "%~1"=="__stay__" (
    cmd /d /k call "%~f0" __stay__
    exit /b
)

title FrameForge - AI Brand Video Studio
set "APPDIR=%LOCALAPPDATA%\\FrameForge"

echo(
echo  =============================================
echo   FrameForge - AI Brand Video Studio
echo  =============================================

if exist "%APPDIR%\\${stamp}.ok" goto :run

echo(
echo  First run: unpacking the app (a few seconds)...
if exist "%APPDIR%" rmdir /s /q "%APPDIR%" >nul 2>nul
mkdir "%APPDIR%" >nul 2>nul

REM The markers are concatenated at runtime so this command line itself never
REM matches them - only the real payload block at the bottom of the file does.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$t=[IO.File]::ReadAllText('%~f0'); $p=($t -split ('::PAYLOAD-'+'BEGIN::'))[1] -split ('::PAYLOAD-'+'END::'); [IO.File]::WriteAllBytes('%APPDIR%\\payload.zip', [Convert]::FromBase64String(($p[0] -replace '\\s','')))"
if not exist "%APPDIR%\\payload.zip" (
    echo  [!] Could not unpack the embedded app payload.
    echo      Re-download this .cmd file and try again.
    goto :end
)

tar -xf "%APPDIR%\\payload.zip" -C "%APPDIR%" >nul 2>nul
if not exist "%APPDIR%\\app\\index.html" (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Force '%APPDIR%\\payload.zip' '%APPDIR%'"
)
if not exist "%APPDIR%\\app\\index.html" (
    echo  [!] Extraction failed.
    goto :end
)
del "%APPDIR%\\payload.zip" >nul 2>nul
type nul > "%APPDIR%\\${stamp}.ok"

:run
echo(
echo  Opening http://127.0.0.1:3999 in your browser...
start "" "http://127.0.0.1:3999"
powershell -NoProfile -ExecutionPolicy Bypass -File "%APPDIR%\\server.ps1" -Root "%APPDIR%\\app" -Port 3999

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
console.log(`✓ ${path.relative(ROOT, TARGET)} (${(size / 1024 / 1024).toFixed(2)} MB, stamp ${stamp})`);
console.log('  Double-click it on any Windows 10/11 PC — no installs needed.');
