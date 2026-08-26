# Bundled smartctl Binary

Place a universal (arm64 + x86_64) \smartctl\ binary in this directory before publishing the macOS app.

## How to obtain
\\\sh
brew install smartmontools
cp \ ./runtimes/osx/smartctl
chmod +x ./runtimes/osx/smartctl
\\\`n
The binary is excluded from git via .gitignore (it is a macOS Mach-O executable).
Add the binary manually on any Mac build machine before running \dotnet publish\.

