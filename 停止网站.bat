@echo off
chcp 65001 >nul
title Stop Life Ledger
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop.ps1"
