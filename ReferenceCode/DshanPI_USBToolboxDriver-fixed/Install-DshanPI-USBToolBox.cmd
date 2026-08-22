@echo off
setlocal

fltmc.exe >nul 2>&1
if errorlevel 1 (
    powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-DshanPI-USBToolBox.ps1"
set "INSTALL_RESULT=%ERRORLEVEL%"
echo.
if not "%INSTALL_RESULT%"=="0" echo Installation failed with exit code %INSTALL_RESULT%.
pause
exit /b %INSTALL_RESULT%
