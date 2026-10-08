# Başka bilgisayara kurulum paketi hazırlar: kurulum\ClaudeAutopilot-Kurulum.zip
# Çalıştır: pwsh -File paketle.ps1
$ErrorActionPreference = 'Stop'
$root   = $PSScriptRoot
$engine = Join-Path $root 'engine'
$out    = Join-Path $root 'kurulum'
$stage  = Join-Path $out 'ClaudeAutopilot'
$zip    = Join-Path $out 'ClaudeAutopilot-Kurulum.zip'

if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force $stage | Out-Null

# 1) Uygulama: .NET kurulu olmayan bilgisayarda da çalışsın diye kendi çalışma zamanıyla birlikte.
dotnet publish (Join-Path $root 'AutopilotApp.csproj') -c Release -r win-x64 --self-contained true -p:DebugType=none -o (Join-Path $stage 'app')
if ($LASTEXITCODE -ne 0) { throw 'Derleme başarısız.' }
Get-ChildItem (Join-Path $stage 'app') -Filter *.xml | Remove-Item   # kütüphane belgeleri gereksiz

# 2) Motor betikleri
$engineOut = Join-Path $stage 'autopilot'
New-Item -ItemType Directory -Force $engineOut | Out-Null
foreach ($f in 'ap.ps1', 'ap.cmd', 'autopilot.ps1', 'sira.ps1', 'kurallar.md', 'TASKS.example.md') {
    Copy-Item (Join-Path $engine $f) $engineOut
}

# 3) Kurulum dosyaları. Yeni bilgisayarda henüz PowerShell 7 olmayabilir; Windows PowerShell 5.1 Türkçe harfleri
#    doğru okusun diye .ps1/.txt UTF-8 BOM ile, .cmd'ler CRLF satır sonuyla yazılır.
$bom = [System.Text.UTF8Encoding]::new($true)
foreach ($f in Get-ChildItem (Join-Path $root 'installer') -File) {
    $text = (Get-Content $f.FullName -Raw -Encoding utf8) -replace "`r?`n", "`r`n"
    $target = Join-Path $stage $f.Name
    if ($f.Extension -eq '.cmd') { [System.IO.File]::WriteAllText($target, $text, [System.Text.Encoding]::ASCII) }
    else { [System.IO.File]::WriteAllText($target, $text, $bom) }
}

# 4) Zip
if (Test-Path $zip) { Remove-Item $zip }
Compress-Archive -Path $stage -DestinationPath $zip -CompressionLevel Optimal
'{0:N0} MB  ->  {1}' -f ((Get-Item $zip).Length / 1MB), $zip
