@echo off
setlocal
cd /d "%~dp0"
set "TODO_NODE="
for /f "delims=" %%N in ('where node.exe 2^>nul') do if not defined TODO_NODE set "TODO_NODE=%%N"
if not defined TODO_NODE if exist "%ProgramFiles%\nodejs\node.exe" set "TODO_NODE=%ProgramFiles%\nodejs\node.exe"
if not defined TODO_NODE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "TODO_NODE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined TODO_NODE goto missing_node
"%TODO_NODE%" "%~dp0start.mjs" %*
if errorlevel 1 goto launch_failed
exit /b 0
:missing_node
echo Node.js 20 or newer was not found. Please install Node.js and try again.
goto failed
:launch_failed
echo Todo could not start. See the error above.
:failed
if defined TODO_NO_PAUSE exit /b 1
pause
exit /b 1
