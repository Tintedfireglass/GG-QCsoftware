$dll = "c:\Users\gento\Desktop\Projects\GG Internship\QC tool\publish\Cirtyn\Cirtyn.dll"
$bytes = [System.IO.File]::ReadAllBytes($dll)
$text = [System.Text.Encoding]::UTF8.GetString($bytes)

if ($text -match "cirtyn_icon_logo") { 
    Write-Host "✅ FOUND: cirtyn_icon_logo embedded in DLL" 
} else { 
    Write-Host "❌ NOT FOUND: cirtyn_icon_logo missing from DLL" 
}

if ($text -match "Brand\.LogoPath") { 
    Write-Host "✅ FOUND: Brand.LogoPath metadata in DLL" 
} else { 
    Write-Host "❌ NOT FOUND: Brand.LogoPath metadata missing" 
}

# Show all Brand.* metadata values
$matches = [regex]::Matches($text, "Brand\.[A-Za-z]+")
$matches | ForEach-Object { Write-Host "  Metadata key: $($_.Value)" } | Sort-Object -Unique
