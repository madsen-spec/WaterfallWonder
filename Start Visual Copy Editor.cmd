@echo off
setlocal
title Waterfall Wonder Visual Copy Editor
cd /d "%~dp0"

where node >nul 2>nul
if not errorlevel 1 (
  set "NODE_EXE=node"
) else (
  set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
  if not exist "%NODE_EXE%" (
    echo.
    echo Node.js is required to run the local Visual Copy Editor.
    echo Install Node.js 18 or newer, then double-click this file again.
    echo.
    pause
    exit /b 1
  )
)

echo.
echo Starting the local Visual Copy Editor...
echo Keep this window open while you edit. Closing it stops the editor.
echo.
"%NODE_EXE%" scripts\visual-copy-server.mjs --open

if errorlevel 1 (
  echo.
  echo The editor stopped with an error. Review the message above.
  pause
)

endlocal
