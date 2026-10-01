@echo off
chcp 65001 >nul
title Life Ledger - running (keep this window open)
cd /d "%~dp0"

set "NODE_EXE=node"
if not exist "C:\Users\¬Ì“Ê¿§\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe" goto run
set "NODE_EXE=node"

:run
"%NODE_EXE%" "%~dp0scripts\start.mjs"
pause
