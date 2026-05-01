# Database Export Script from Supabase (Windows PowerShell)
# This script exports all data from Supabase to local SQL files

$ErrorActionPreference = "Stop"

# Supabase connection details from .env.local
$env:PGHOST = "aws-1-ap-south-1.pooler.supabase.com"
$env:PGPORT = "5432"  # Use non-pooling port
$env:PGUSER = "postgres.sizfngtkvhcdjncfjuoe"
$env:PGPASSWORD = "YfaAkBQX0fk3Gi0k"
$env:PGDATABASE = "postgres"

Write-Host "Starting database export from Supabase..." -ForegroundColor Cyan
Write-Host "Host: $env:PGHOST`:$env:PGPORT"
Write-Host "Database: $env:PGDATABASE"

# Create export directory
$exportDir = Join-Path $PSScriptRoot "..\db_export"
if (!(Test-Path $exportDir)) {
    New-Item -ItemType Directory -Path $exportDir -Force | Out-Null
}

# Check if pg_dump is available
$pgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
if (!$pgDump) {
    Write-Host "pg_dump not found. Please install PostgreSQL client tools." -ForegroundColor Red
    Write-Host "You can download from: https://www.postgresql.org/download/" -ForegroundColor Yellow
    exit 1
}

# Export each table
function Export-Table {
    param(
        [string]$TableName,
        [string]$OutputFile
    )
    
    Write-Host "Exporting $TableName table..." -ForegroundColor Yellow
    
    $connString = "host=$env:PGHOST port=$env:PGPORT user=$env:PGUSER password=$env:PGPASSWORD dbname=$env:PGDATABASE sslmode=require"
    
    & pg_dump -h $env:PGHOST -p $env:PGPORT -U $env:PGUSER -d $env:PGDATABASE -t $TableName --data-only -n public -f $OutputFile 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  -> Saved to $OutputFile" -ForegroundColor Green
    } else {
        Write-Host "  -> Failed to export $TableName" -ForegroundColor Red
    }
}

# Export tables
Export-Table -TableName "machines" -OutputFile (Join-Path $exportDir "machines.sql")
Export-Table -TableName "qc_results" -OutputFile (Join-Path $exportDir "qc_results.sql")
Export-Table -TableName "test_results" -OutputFile (Join-Path $exportDir "test_results.sql")
Export-Table -TableName "users" -OutputFile (Join-Path $exportDir "users.sql")

Write-Host ""
Write-Host "Export complete! Files saved to $exportDir" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Set up your new PostgreSQL database"
Write-Host "2. Run the init-db.sql script to create tables"
Write-Host "3. Import the exported SQL files into your new database"
Write-Host "4. Update .env.local with new database credentials"