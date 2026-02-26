# ──────────────────────────────────────────────────────────────
#  Pramaan QC Reminder — Scheduled Task Registration
#  Run this script as Administrator to register or unregister.
#
#  Usage:
#    .\register-reminder.ps1              # Register
#    .\register-reminder.ps1 -Unregister  # Unregister
# ──────────────────────────────────────────────────────────────

param(
    [switch]$Unregister
)

$TaskName = "PramaanQCReminder"

if ($Unregister) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "✓ Scheduled task '$TaskName' removed." -ForegroundColor Green
    exit 0
}

# Find PramaanReminder.exe (look next to this script, then in src output)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ReminderExe = Join-Path $ScriptDir "..\src\LaptopQC.Reminder\bin\Release\net8.0-windows10.0.17763.0\PramaanReminder.exe"

# Fallback: check for published single-file
if (-not (Test-Path $ReminderExe)) {
    $ReminderExe = Join-Path $ScriptDir "..\src\LaptopQC.Reminder\bin\Debug\net8.0-windows10.0.17763.0\PramaanReminder.exe"
}

if (-not (Test-Path $ReminderExe)) {
    Write-Host "✗ PramaanReminder.exe not found. Build the project first:" -ForegroundColor Red
    Write-Host "  dotnet build src\LaptopQC.Reminder\LaptopQC.Reminder.csproj" -ForegroundColor Yellow
    exit 1
}

$ReminderExe = (Resolve-Path $ReminderExe).Path

# Create the scheduled task
$Action = New-ScheduledTaskAction -Execute $ReminderExe
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 1)

# Register (replace if exists)
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Description "Checks if a Pramaan QC test is overdue and shows a reminder notification." `
    -RunLevel Limited | Out-Null

Write-Host "✓ Scheduled task '$TaskName' registered." -ForegroundColor Green
Write-Host "  Exe: $ReminderExe" -ForegroundColor Cyan
Write-Host "  Trigger: At logon (daily check)" -ForegroundColor Cyan
