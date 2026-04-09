@echo off
setlocal
set "ROOT=%~dp0"
set "ISCC="

call "%ROOT%publish.bat" nopause
if %ERRORLEVEL% neq 0 exit /b %ERRORLEVEL%

if exist "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" set "ISCC=C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if not defined ISCC if exist "C:\Program Files\Inno Setup 6\ISCC.exe" set "ISCC=C:\Program Files\Inno Setup 6\ISCC.exe"
if not defined ISCC (
    for /f "delims=" %%I in ('where ISCC.exe 2^>nul') do (
        set "ISCC=%%I"
        goto :found_iscc
    )
)

:found_iscc
if not defined ISCC (
    echo [ERROR] Inno Setup Compiler (ISCC.exe) not found.
    echo Install Inno Setup 6 from https://jrsoftware.org/isdl.php
    exit /b 1
)

"%ISCC%" "%ROOT%installer\installer.iss"
exit /b %ERRORLEVEL%

