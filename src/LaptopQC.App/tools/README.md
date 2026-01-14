# Smartctl Setup for SMART Testing

This tool folder should contain `smartctl.exe` from smartmontools for SMART drive diagnostics.

## Download Instructions

1. Go to [smartmontools.org/wiki/Download](https://www.smartmontools.org/wiki/Download)
2. Download the Windows installer: `smartmontools-X.X-win32-setup.exe`
3. Run the installer and choose **"Extract files only"** (no registry changes)
4. Copy these files from the extracted location to this `tools` folder:
   - `smartctl.exe` (required)
   - Any `.dll` files in the same folder (if present)

## Alternative: Direct Download

You can also use 7-Zip to extract files directly from the installer:
```
7z x smartmontools-X.X-win32-setup.exe -oextracted
copy extracted\bin\smartctl.exe tools\
```

## Verification

After placing `smartctl.exe` here, rebuild the project. The file will be automatically
copied to the output directory and bundled with the application.

To test manually:
```
.\tools\smartctl.exe --version
.\tools\smartctl.exe --scan
```
