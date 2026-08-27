Add-Type -AssemblyName System.Drawing

$pngPath = "c:\Users\gento\Desktop\Projects\GG Internship\QC tool\cirtynicon.png"
$icoPath = "c:\Users\gento\Desktop\Projects\GG Internship\QC tool\src\LaptopQC.App\Resources\cirtyn_icon.ico"

$png = New-Object System.Drawing.Bitmap($pngPath)

$sizes = @(256, 128, 64, 48, 32, 16)
$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($ms)

# ICO header
$bw.Write([uint16]0)              # reserved
$bw.Write([uint16]1)              # type = icon
$bw.Write([uint16]$sizes.Count)   # image count

# Collect PNG data for each size
$images = @()
foreach ($size in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap($png, $size, $size)
    $imgStream = New-Object System.IO.MemoryStream
    $bmp.Save($imgStream, [System.Drawing.Imaging.ImageFormat]::Png)
    $images += , $imgStream.ToArray()
    $bmp.Dispose()
    $imgStream.Dispose()
}

# Directory entries: header is 6 bytes, each entry is 16 bytes
$dataOffset = 6 + (16 * $sizes.Count)
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $sz = if ($sizes[$i] -ge 256) { 0 } else { $sizes[$i] }
    $bw.Write([byte]$sz)
    $bw.Write([byte]$sz)
    $bw.Write([byte]0)         # color count
    $bw.Write([byte]0)         # reserved
    $bw.Write([uint16]1)       # color planes
    $bw.Write([uint16]32)      # bits per pixel
    $bw.Write([uint32]$images[$i].Length)
    $bw.Write([uint32]$dataOffset)
    $dataOffset += $images[$i].Length
}

# Write image data
foreach ($imgData in $images) {
    $bw.Write($imgData)
}

$bw.Flush()
[System.IO.File]::WriteAllBytes($icoPath, $ms.ToArray())
$png.Dispose()

Write-Host "Done. ICO written to: $icoPath"
Write-Host "ICO size: $((Get-Item $icoPath).Length) bytes"
