@echo off
call "%~dp0publish.bat" nopause
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" "%~dp0installer\installer.iss"

