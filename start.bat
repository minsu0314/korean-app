@echo off
rem Double-click to start the app. Close this window to stop it.
cd /d "%~dp0"
title Korean Phrase Practice
start "" chrome "http://localhost:5173"
echo.
echo  Korean Phrase Practice is running.
echo  Keep this window open while you practice.
echo  Close this window when you are done.
echo.
node serve.js
echo.
pause
