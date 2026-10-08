<#
  Claude Autopilot kurulumu (Windows 10/11, 64 bit).
  Kur.cmd'ye çift tıklayınca çalışır. Yönetici yetkisi gerekmez; eksik araçlar kurulurken Windows izin isteyebilir.
  Tekrar çalıştırılırsa günceller (ayarlar ve projeler korunur).

  -Deneme : hiçbir şeyi değiştirmeden ne yapacağını gösterir.
#>
param([switch]$Deneme)

$ErrorActionPreference = 'Stop'
$src       = $PSScriptRoot
$dest      = Join-Path $env:LOCALAPPDATA 'Programs\ClaudeAutopilot'
$exe       = Join-Path $dest 'app\ClaudeAutopilot.exe'
$engineDir = Join-Path $dest 'autopilot'

# ---------------------------------------------------------------- yardımcılar
function Step([string]$t) { Write-Host ''; Write-Host "» $t" -ForegroundColor Cyan }
function Ok([string]$t) { Write-Host "  + $t" -ForegroundColor Green }
function Warn([string]$t) { Write-Host "  ! $t" -ForegroundColor Yellow }

function Run([string]$desc, [scriptblock]$action) {
    if ($Deneme) { Write-Host "  (deneme) $desc" -ForegroundColor DarkGray } else { & $action }
}

function Ask([string]$question, [bool]$default = $true) {
    if ($Deneme) { return $default }
    $hint = if ($default) { '(E/h)' } else { '(e/H)' }
    $answer = Read-Host "  $question $hint"
    if ([string]::IsNullOrWhiteSpace($answer)) { return $default }
    return $answer -match '^[eEyY]'
}

function Update-SessionPath {
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}

function Find-Tool([string]$name, [string[]]$extra) {
    $cmd = Get-Command $name -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($cmd) { return $cmd.Source }
    foreach ($p in $extra) { if ($p -and (Test-Path $p)) { return $p } }
    return $null
}

# Kullanıcı PATH'ine ekler; %USERPROFILE% gibi değişkenler korunur.
function Add-UserPath([string]$dir) {
    $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $true)
    $raw = [string]$key.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
    $parts = @($raw -split ';' | Where-Object { $_ })
    if ($parts -notcontains $dir) {
        $key.SetValue('Path', (($parts + $dir) -join ';'), [Microsoft.Win32.RegistryValueKind]::ExpandString)
        # Yeni açılan terminallerin değişikliği görmesi için Windows'a haber ver.
        [Environment]::SetEnvironmentVariable('CLAUDE_AUTOPILOT_KURULUM', '1', 'User')
        [Environment]::SetEnvironmentVariable('CLAUDE_AUTOPILOT_KURULUM', $null, 'User')
    }
    $key.Close()
    if (($env:Path -split ';') -notcontains $dir) { $env:Path += ";$dir" }
}

function New-Shortcut([string]$lnk, [string]$target) {
    $shell = New-Object -ComObject WScript.Shell
    $sc = $shell.CreateShortcut($lnk)
    $sc.TargetPath = $target
    $sc.WorkingDirectory = Split-Path $target
    $sc.IconLocation = "$target,0"
    $sc.Description = 'Claude Autopilot kontrol merkezi'
    $sc.Save()
}

# ---------------------------------------------------------------- başlangıç
Write-Host ''
Write-Host '  Claude Autopilot kurulumu' -ForegroundColor Magenta
if ($Deneme) { Write-Host '  Deneme modu: hiçbir şey değiştirilmeyecek.' -ForegroundColor DarkGray }

if (-not (Test-Path (Join-Path $src 'app\ClaudeAutopilot.exe'))) {
    throw "Kurulum dosyaları eksik (app\ClaudeAutopilot.exe yok). Zip'in tamamını bir klasöre çıkarıp Kur.cmd'yi oradan çalıştır."
}
if (-not [Environment]::Is64BitOperatingSystem) { throw 'Bu uygulama 64 bit Windows gerektirir.' }

# ---------------------------------------------------------------- gerekenler
Step 'Gerekenler kontrol ediliyor'
Update-SessionPath
$wvKeys = @(
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
    'HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
    'HKCU:\Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
)
$webview = $wvKeys | ForEach-Object { (Get-ItemProperty $_ -ErrorAction SilentlyContinue).pv } |
    Where-Object { $_ -and $_ -ne '0.0.0.0' } | Select-Object -First 1

$tools = @(
    @{ Name = 'PowerShell 7'; Note = 'motor bununla çalışır'; Id = 'Microsoft.PowerShell'; Url = 'https://aka.ms/powershell'
       Found = (Find-Tool 'pwsh' @("$env:ProgramFiles\PowerShell\7\pwsh.exe")) },
    @{ Name = 'Git'; Note = 'Claude Code Windows''ta bunu kullanır'; Id = 'Git.Git'; Url = 'https://git-scm.com/download/win'
       Found = (Find-Tool 'git' @("$env:ProgramFiles\Git\cmd\git.exe")) },
    @{ Name = 'WebView2'; Note = 'uygulamanın arayüzü'; Id = 'Microsoft.EdgeWebView2Runtime'; Url = 'https://go.microsoft.com/fwlink/p/?LinkId=2124703'
       Found = $webview }
)
$missing = @($tools | Where-Object { -not $_.Found })
foreach ($t in $tools) { if ($t.Found) { Ok $t.Name } else { Warn "$($t.Name) yok ($($t.Note))" } }

$claude = Find-Tool 'claude' @("$env:USERPROFILE\.local\bin\claude.exe", "$env:APPDATA\npm\claude.cmd")
if ($claude) { Ok 'Claude Code' } else { Warn 'Claude Code yok' }

if ($missing.Count -gt 0) {
    Step 'Eksik araçlar'
    $winget = Find-Tool 'winget' @()
    $names = ($missing | ForEach-Object { $_.Name }) -join ', '
    if (-not $winget) {
        Warn 'winget bulunamadı. Şunları elle kurup bu kurulumu tekrar çalıştır:'
        $missing | ForEach-Object { Write-Host "    $($_.Name): $($_.Url)" }
    } elseif (Ask "$names winget ile kurulsun mu?") {
        foreach ($m in $missing) {
            Run "winget install $($m.Id)" {
                Write-Host "  $($m.Name) kuruluyor…"
                & $winget install --id $m.Id -e --source winget --accept-package-agreements --accept-source-agreements
                if ($LASTEXITCODE -ne 0) { Warn "$($m.Name) kurulamadı (kod $LASTEXITCODE). Elle kur: $($m.Url)" }
            }
        }
        Update-SessionPath
    } else {
        Warn 'Eksikler kurulmadan motor çalışmaz; uygulama yine de kurulacak.'
    }
}

if (-not $claude) {
    Step 'Claude Code'
    if (Ask 'Claude Code resmi kurulum betiğiyle (claude.ai/install.ps1) kurulsun mu?') {
        Run 'Claude Code kurulumu' {
            [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
            $installer = Join-Path $env:TEMP 'claude-install.ps1'
            Invoke-WebRequest 'https://claude.ai/install.ps1' -UseBasicParsing -OutFile $installer
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installer   # ayrı süreçte: kendi 'exit'i bu kurulumu kesmesin
            Remove-Item $installer -ErrorAction SilentlyContinue
            Update-SessionPath
            $local = Join-Path $env:USERPROFILE '.local\bin'
            if (-not (Get-Command claude -ErrorAction SilentlyContinue) -and (Test-Path (Join-Path $local 'claude.exe'))) { Add-UserPath $local }
            if (Get-Command claude -ErrorAction SilentlyContinue) { Ok 'Claude Code kuruldu' }
            else { Warn 'Claude Code kurulamadı. Elle kur: https://docs.claude.com/en/docs/claude-code/setup' }
        }
    }
}

# ---------------------------------------------------------------- uygulama
Step 'Uygulama kuruluyor'
Write-Host "  Konum: $dest"
Run 'Açıksa uygulamayı kapat' {
    Get-Process ClaudeAutopilot -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Milliseconds 600
}
Run 'app\ ve autopilot\ klasörlerini kopyala' {
    New-Item -ItemType Directory -Force $dest | Out-Null
    if (Test-Path (Join-Path $dest 'app')) { Remove-Item (Join-Path $dest 'app') -Recurse -Force }
    Copy-Item (Join-Path $src 'app') (Join-Path $dest 'app') -Recurse -Force

    New-Item -ItemType Directory -Force $engineDir | Out-Null
    $rules = Join-Path $engineDir 'kurallar.md'
    if ((Test-Path $rules) -and (Get-FileHash $rules).Hash -ne (Get-FileHash (Join-Path $src 'autopilot\kurallar.md')).Hash) {
        Copy-Item $rules "$rules.yedek" -Force
        Warn 'Değiştirdiğin kurallar.md, kurallar.md.yedek olarak saklandı.'
    }
    Copy-Item (Join-Path $src 'autopilot\*') $engineDir -Recurse -Force
    Copy-Item (Join-Path $src 'kaldir.ps1'), (Join-Path $src 'Kaldir.cmd') $dest -Force

    # İnternetten indirilen zip'in "güvenilmeyen dosya" işaretini kaldır (yoksa SmartScreen uyarır).
    Get-ChildItem $dest -Recurse -File | Unblock-File
    Ok 'Dosyalar kopyalandı'
}

Step "'ap' komutu"
Run "Kullanıcı PATH'ine ekle: $engineDir" { Add-UserPath $engineDir; Ok "Yeni açtığın terminallerde 'ap' komutu çalışır." }

Step 'Kısayollar'
Run 'Başlat menüsü kısayolu' {
    New-Shortcut (Join-Path ([Environment]::GetFolderPath('Programs')) 'Claude Autopilot.lnk') $exe
    Ok 'Başlat menüsüne eklendi'
}
if (Ask 'Masaüstüne de kısayol eklensin mi?') {
    Run 'Masaüstü kısayolu' {
        New-Shortcut (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Claude Autopilot.lnk') $exe
        Ok 'Masaüstüne eklendi'
    }
}

Run 'Windows Ayarlar > Uygulamalar listesine ekle (kaldırma için)' {
    $u = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\ClaudeAutopilot'
    New-Item $u -Force | Out-Null
    $version = ((Get-Item $exe).VersionInfo.ProductVersion -split '\+')[0]
    $sizeKb = [int]((Get-ChildItem $dest -Recurse -File | Measure-Object Length -Sum).Sum / 1KB)
    Set-ItemProperty $u DisplayName 'Claude Autopilot'
    Set-ItemProperty $u DisplayVersion $version
    Set-ItemProperty $u Publisher 'Claude Autopilot'
    Set-ItemProperty $u DisplayIcon "$exe,0"
    Set-ItemProperty $u InstallLocation $dest
    Set-ItemProperty $u UninstallString "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$dest\kaldir.ps1`""
    New-ItemProperty $u NoModify -Value 1 -PropertyType DWord -Force | Out-Null
    New-ItemProperty $u NoRepair -Value 1 -PropertyType DWord -Force | Out-Null
    New-ItemProperty $u EstimatedSize -Value $sizeKb -PropertyType DWord -Force | Out-Null
}

# ---------------------------------------------------------------- bitiş
Step 'Kurulum tamam'
Write-Host '  Sonraki adımlar:'
Write-Host '   1. Uygulamada Ayarlar > Claude girişi > "Terminali aç": tarayıcıda giriş yap, çıkan token''ı yapıştırıp Kaydet.'
Write-Host '   2. Proje klasörünü seç (TASKS.md olan ya da olacak klasör) ve ilk görevini ekle.'
Write-Host '  Not: Kullanım limiti Claude hesabına bağlıdır; iki bilgisayarda aynı anda çalıştırırsan limit iki kat hızlı dolar.' -ForegroundColor DarkGray
Write-Host "  Kaldırmak için: Windows Ayarlar > Uygulamalar > Claude Autopilot" -ForegroundColor DarkGray
if (Ask 'Uygulama şimdi açılsın mı?') { Run 'Uygulamayı aç' { Start-Process $exe } }
