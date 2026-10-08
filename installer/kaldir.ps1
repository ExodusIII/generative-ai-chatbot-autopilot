<#
  Claude Autopilot'u bu bilgisayardan kaldırır.
  Proje klasörlerine (TASKS.md, sonuclar) dokunmaz. PowerShell 7, Git ve Claude Code da yerinde kalır.
  -Deneme : hiçbir şeyi değiştirmeden ne yapacağını gösterir.
#>
param([switch]$Deneme)

$ErrorActionPreference = 'Continue'
$dest      = Join-Path $env:LOCALAPPDATA 'Programs\ClaudeAutopilot'
$engineDir = Join-Path $dest 'autopilot'

function Run([string]$desc, [scriptblock]$action) {
    if ($Deneme) { Write-Host "  (deneme) $desc" -ForegroundColor DarkGray } else { & $action }
}
function Ask([string]$question, [bool]$default) {
    if ($Deneme) { return $default }
    $hint = if ($default) { '(E/h)' } else { '(e/H)' }
    $answer = Read-Host "  $question $hint"
    if ([string]::IsNullOrWhiteSpace($answer)) { return $default }
    return $answer -match '^[eEyY]'
}

Write-Host ''
Write-Host '  Claude Autopilot kaldırılıyor' -ForegroundColor Magenta
Write-Host "  Konum: $dest"
if (-not (Ask 'Devam edilsin mi?' $true)) { return }

Run 'Uygulamayı ve bu kurulumdan çalışan motoru kapat' {
    Get-Process ClaudeAutopilot -ErrorAction SilentlyContinue | Stop-Process -Force
    Get-CimInstance Win32_Process -Filter "Name='pwsh.exe' OR Name='powershell.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -and $_.CommandLine -like "*$engineDir*autopilot.ps1*" } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 600
}

Run "Kullanıcı PATH'inden çıkar: $engineDir" {
    $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $true)
    $raw = [string]$key.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
    $parts = @($raw -split ';' | Where-Object { $_ -and $_ -ne $engineDir })
    $key.SetValue('Path', ($parts -join ';'), [Microsoft.Win32.RegistryValueKind]::ExpandString)
    $key.Close()
    [Environment]::SetEnvironmentVariable('CLAUDE_AUTOPILOT_KURULUM', '1', 'User')
    [Environment]::SetEnvironmentVariable('CLAUDE_AUTOPILOT_KURULUM', $null, 'User')
}

Run 'Kısayolları, Windows başlangıç kaydını ve Uygulamalar listesi kaydını sil' {
    foreach ($lnk in @(
        (Join-Path ([Environment]::GetFolderPath('Programs')) 'Claude Autopilot.lnk'),
        (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Claude Autopilot.lnk'))) {
        Remove-Item $lnk -ErrorAction SilentlyContinue
    }
    Remove-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name ClaudeAutopilot -ErrorAction SilentlyContinue
    Remove-Item 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\ClaudeAutopilot' -Recurse -ErrorAction SilentlyContinue
}

Run "Program dosyalarını sil: $dest" { Remove-Item $dest -Recurse -Force -ErrorAction SilentlyContinue }

if (Ask 'Uygulama ayarları da silinsin mi? (proje listesi, tema, bildirim tercihleri)' $false) {
    Run 'Ayarları sil' {
        Remove-Item (Join-Path $env:APPDATA 'ClaudeAutopilot') -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item (Join-Path $env:LOCALAPPDATA 'ClaudeAutopilot') -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Write-Host ''
Write-Host '  Kaldırıldı. Proje klasörlerin (TASKS.md, sonuclar) yerinde duruyor.' -ForegroundColor Green
Write-Host '  Claude girişi token''ı (CLAUDE_CODE_OAUTH_TOKEN) silinmedi; istersen Windows ortam değişkenlerinden kaldırabilirsin.' -ForegroundColor DarkGray
