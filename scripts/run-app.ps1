param(
  [Parameter(Mandatory = $false)]
  [string]$Brand = "Pramaan",

  [Parameter(Mandatory = $false)]
  [ValidateSet("Debug", "Release")]
  [string]$Configuration = "Debug",

  [Parameter(Mandatory = $false)]
  [switch]$Restore
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$project = Join-Path $repoRoot "src\\LaptopQC.App\\LaptopQC.App.csproj"

if ($Restore) {
  dotnet restore $project --ignore-failed-sources | Out-Host
}

dotnet build $project -c $Configuration -p:Brand=$Brand --no-restore | Out-Host

$outputDir = Join-Path $repoRoot "src\\LaptopQC.App\\bin\\$Configuration\\net8.0-windows"

$preferredExe = Join-Path $outputDir "$Brand.exe"
if (Test-Path -LiteralPath $preferredExe) {
  & $preferredExe
  exit $LASTEXITCODE
}

$exe = Get-ChildItem -LiteralPath $outputDir -Filter "*.exe" -File |
  Where-Object { $_.Name -notmatch "vshost|TestHost|dotnet" } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $exe) {
  throw "No .exe found in output folder: $outputDir"
}

& $exe.FullName
exit $LASTEXITCODE

