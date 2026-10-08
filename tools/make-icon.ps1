# Uygulama simgesini (Assets\app.ico) çizer: turuncu→mor degrade kare üzerinde beyaz kıvılcım.
# Kullanım: pwsh -File tools\make-icon.ps1
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'
$out = Join-Path $PSScriptRoot '..\Assets\app.ico'

function New-RoundedPath([System.Drawing.RectangleF]$r, [float]$rad) {
    $p = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $d = $rad * 2
    $p.AddArc($r.X, $r.Y, $d, $d, 180, 90)
    $p.AddArc($r.Right - $d, $r.Y, $d, $d, 270, 90)
    $p.AddArc($r.Right - $d, $r.Bottom - $d, $d, $d, 0, 90)
    $p.AddArc($r.X, $r.Bottom - $d, $d, $d, 90, 90)
    $p.CloseFigure()
    return $p
}

function New-Frame([int]$s) {
    $bmp = [System.Drawing.Bitmap]::new($s, $s, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    $pad = [math]::Max(0.5, $s * 0.04)
    $rect = [System.Drawing.RectangleF]::new($pad, $pad, $s - 2 * $pad, $s - 2 * $pad)
    $bg = New-RoundedPath $rect ($s * 0.25)
    $grad = [System.Drawing.Drawing2D.LinearGradientBrush]::new($rect,
        [System.Drawing.Color]::FromArgb(255, 255, 138, 91),
        [System.Drawing.Color]::FromArgb(255, 180, 92, 255), 45.0)
    $g.FillPath($grad, $bg)

    # Üstten hafif parlaklık
    $hi = [System.Drawing.RectangleF]::new($rect.X, $rect.Y, $rect.Width, $rect.Height * 0.55)
    $hiBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new($hi,
        [System.Drawing.Color]::FromArgb(60, 255, 255, 255),
        [System.Drawing.Color]::FromArgb(0, 255, 255, 255), 90.0)
    $g.SetClip($bg)
    $g.FillRectangle($hiBrush, $hi)
    $g.ResetClip()

    # Dört köşeli kıvılcım (kenarları içe kavisli)
    $cx = $s / 2; $cy = $s / 2; $R = $s * 0.31; $k = $s * 0.05
    $tips = @(
        [System.Drawing.PointF]::new($cx, $cy - $R),
        [System.Drawing.PointF]::new($cx + $R, $cy),
        [System.Drawing.PointF]::new($cx, $cy + $R),
        [System.Drawing.PointF]::new($cx - $R, $cy)
    )
    $ctrl = @(
        [System.Drawing.PointF]::new($cx + $k, $cy - $k),
        [System.Drawing.PointF]::new($cx + $k, $cy + $k),
        [System.Drawing.PointF]::new($cx - $k, $cy + $k),
        [System.Drawing.PointF]::new($cx - $k, $cy - $k)
    )
    $star = [System.Drawing.Drawing2D.GraphicsPath]::new()
    for ($i = 0; $i -lt 4; $i++) {
        $a = $tips[$i]; $b = $tips[($i + 1) % 4]; $c = $ctrl[$i]
        $star.AddBezier($a, $c, $c, $b)
    }
    $star.CloseFigure()
    $g.FillPath([System.Drawing.Brushes]::White, $star)

    $g.Dispose()
    $ms = [System.IO.MemoryStream]::new()
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    return , $ms.ToArray()
}

$sizes = 16, 20, 24, 32, 40, 48, 64, 128, 256
$frames = foreach ($s in $sizes) { , (New-Frame $s) }

$fs = [System.IO.File]::Create((Resolve-Path (Split-Path $out)).Path + '\app.ico')
$w = [System.IO.BinaryWriter]::new($fs)
$w.Write([uint16]0); $w.Write([uint16]1); $w.Write([uint16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $s = $sizes[$i]; $data = $frames[$i]
    $w.Write([byte]($(if ($s -ge 256) { 0 } else { $s })))
    $w.Write([byte]($(if ($s -ge 256) { 0 } else { $s })))
    $w.Write([byte]0); $w.Write([byte]0)
    $w.Write([uint16]1); $w.Write([uint16]32)
    $w.Write([uint32]$data.Length); $w.Write([uint32]$offset)
    $offset += $data.Length
}
foreach ($data in $frames) { $w.Write($data) }
$w.Dispose()
Write-Host "Yazıldı: $out"
