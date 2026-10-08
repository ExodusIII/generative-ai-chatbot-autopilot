@echo off
title Claude Autopilot kurulumu
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0kur.ps1" %*
echo.
pause
