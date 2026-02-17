; ===================================================
; Laptop QC Tool - Inno Setup Installer Script
; ===================================================
; 
; To build the installer:
; 1. Install Inno Setup from https://jrsoftware.org/isdl.php
; 2. Run publish.bat first to build the application
; 3. Open this file in Inno Setup Compiler
; 4. Click Build > Compile (or press Ctrl+F9)
; 5. Installer will be created in the Output folder
;
; ===================================================

#define MyAppName "Pramana"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "GadgetGuruz"
#define MyAppExeName "Pramana.exe"
#define MyAppURL "https://gg-qcsoftware.vercel.app/"

[Setup]
; Application identity
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}

; Installation locations
DefaultDirName={autopf}\{#MyAppPublisher}\{#MyAppName}
UsePreviousAppDir=no
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes

; Output settings
OutputDir=Output
OutputBaseFilename=Pramana_Setup_{#MyAppVersion}
; SetupIconFile - uncomment and set path if you have an icon file
SetupIconFile=..\src\LaptopQC.App\Resources\pramana_icon.ico
Compression=lzma2/ultra64
SolidCompression=yes

; Installer UI
WizardStyle=modern
WizardResizable=no

; Privileges - require admin for hardware diagnostics
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=

; Windows version requirement
MinVersion=10.0

; Uninstaller
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName}

; Architecture
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; Main application executable
Source: "..\publish\Pramana.exe"; DestDir: "{app}"; Flags: ignoreversion

; Tools folder (smartctl.exe for SMART diagnostics)
Source: "..\publish\tools\*"; DestDir: "{app}\tools"; Flags: ignoreversion recursesubdirs createallsubdirs

; Any additional files from publish folder (runtime files, DLLs, etc.)
Source: "..\publish\*.dll"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "..\publish\*.json"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "..\publish\*.pdb"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist

[Icons]
; Start Menu shortcut
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Comment: "Pramana - Refurbished Laptop Diagnostic System"

; Desktop shortcut (optional)
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon; Comment: "Pramana - Refurbished Laptop Diagnostic System"

[Run]
; Option to run after installation
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent runascurrentuser

[Code]
// Show a message about admin privileges requirement
function InitializeSetup(): Boolean;
begin
  Result := True;
  // Could add pre-installation checks here if needed
end;

// Custom uninstall confirmation
function InitializeUninstall(): Boolean;
begin
  Result := False;
  if MsgBox('Do you want to uninstall the app? You''ll miss out on the features!', mbConfirmation, MB_YESNO) = IDYES then
  begin
    Result := True;
  end;
end;

// Custom uninstall cleanup if needed
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
  begin
    // Clean up any app data if needed (optional)
    // DelTree(ExpandConstant('{localappdata}\LaptopQC'), True, True, True);
  end;
end;
