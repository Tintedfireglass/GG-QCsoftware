@echo off
REM ========================================
REM Laptop QC Tool - Build & Publish Script
REM ========================================

echo.
echo ============================================
echo   Laptop QC Tool - Build Script
echo ============================================
echo.

REM Set paths
set PROJECT_DIR=%~dp0
set SRC_DIR=%PROJECT_DIR%src\LaptopQC.App
set PUBLISH_DIR=%PROJECT_DIR%publish
set TOOLS_SRC=%SRC_DIR%\tools

REM Clean previous publish
echo [1/4] Cleaning previous build...
if exist "%PUBLISH_DIR%" rmdir /s /q "%PUBLISH_DIR%"
mkdir "%PUBLISH_DIR%"

REM Build and Publish
echo [2/4] Publishing self-contained application...
dotnet publish "%SRC_DIR%\LaptopQC.App.csproj" ^
    -c Release ^
    -r win-x64 ^
    --self-contained true ^
    -p:PublishSingleFile=false ^
    -p:PublishReadyToRun=true ^
    -o "%PUBLISH_DIR%"

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Build failed! Check errors above.
    pause
    exit /b 1
)

REM Copy tools folder (smartctl.exe)
echo [3/4] Copying smartctl.exe to publish folder...
if not exist "%PUBLISH_DIR%\tools" mkdir "%PUBLISH_DIR%\tools"
if exist "%TOOLS_SRC%\smartctl.exe" (
    copy /y "%TOOLS_SRC%\smartctl.exe" "%PUBLISH_DIR%\tools\" >nul
    echo       smartctl.exe copied successfully.
) else (
    echo [WARNING] smartctl.exe not found in %TOOLS_SRC%
    echo           SMART diagnostics will not work without it!
)
REM Copy any DLLs that smartctl might need
if exist "%TOOLS_SRC%\*.dll" (
    copy /y "%TOOLS_SRC%\*.dll" "%PUBLISH_DIR%\tools\" >nul
)

echo [4/4] Build complete!
echo.
echo ============================================
echo   Output: %PUBLISH_DIR%
echo ============================================
echo.
echo Files created:
dir /b "%PUBLISH_DIR%"
echo.
echo Next steps:
echo   1. Install Inno Setup from: https://jrsoftware.org/isdl.php
echo   2. Open installer\installer.iss in Inno Setup Compiler
echo   3. Click Build ^> Compile to create the installer
echo.
if "%1"=="nopause" goto :eof
pause
