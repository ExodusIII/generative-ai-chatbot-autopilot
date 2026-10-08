<#
  Claude Autopilot motoru. Doğrudan çalıştırmana gerek yok, `ap` komutu bunu arkada başlatır.
  - Her turda sira.ps1 sıradaki işi seçer: normal görev, süreli görevin yeni bir turu ya da süresi dolan görevin kapanışı.
  - Claude o işi kurallar.md'ye göre, temiz bir context ile yapar.
  - Limit dolunca reset saatine kadar bekler, sonra kaldığı yerden devam eder.
  - Çalışırken bilgisayarın uykuya geçmesini engeller.
  - Yapılacak iş kalmayınca durur.
#>
param(
    [Parameter(Mandatory)] [string]$ProjectDir,
    [switch]$Tam,                       # izin sormadan her şeyi yapar (--dangerously-skip-permissions)
    [int]$FallbackWaitMinutes = 30,
    [int]$PauseBetweenRunsSeconds = 10
)

$ErrorActionPreference = "Continue"
# claude çıktıyı UTF-8 yazar; konsolun varsayılan kod sayfasıyla (850/857) okunursa Türkçe harfler bozulur.
try { [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false) } catch { }
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Set-Location $ProjectDir
$stateDir = Join-Path $ProjectDir ".autopilot"
$logDir   = Join-Path $stateDir "logs"
$tasks    = Join-Path $ProjectDir "TASKS.md"
$sira     = Join-Path $PSScriptRoot "sira.ps1"
$appLock  = Join-Path $stateDir "zamanli.lock"
$rules    = Get-Content (Join-Path $PSScriptRoot "kurallar.md") -Raw -Encoding utf8
New-Item -ItemType Directory -Force $logDir | Out-Null
$PID | Set-Content (Join-Path $stateDir "pid")

function Set-Durum([string]$text) {
    "$(Get-Date -Format 'dd.MM HH:mm')  $text" | Set-Content (Join-Path $stateDir "durum.txt")
}

# Bu işlem yaşadığı sürece Windows uykuya geçmesin (sistem ayarını değiştirmez).
Add-Type -Namespace Win -Name Power -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);'
[Win.Power]::SetThreadExecutionState(0x80000001) | Out-Null   # ES_CONTINUOUS | ES_SYSTEM_REQUIRED

function Get-ResetWaitSeconds([string]$text) {
    # Eski format: "Claude AI usage limit reached|1727000000"
    if ($text -match '\|(\d{10})') {
        $reset = [DateTimeOffset]::FromUnixTimeSeconds([long]$Matches[1]).LocalDateTime
        return [math]::Max(60, ($reset - (Get-Date)).TotalSeconds + 120)
    }
    # Yeni format: "... resets 3pm" / "resets at 15:30" / "resets 3:30pm"
    if ($text -match 'resets?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?') {
        $h = [int]$Matches[1]; $m = if ($Matches[2]) { [int]$Matches[2] } else { 0 }
        if ($Matches[3] -eq 'pm' -and $h -lt 12) { $h += 12 }
        if ($Matches[3] -eq 'am' -and $h -eq 12) { $h = 0 }
        $reset = (Get-Date).Date.AddHours($h).AddMinutes($m)
        if ($reset -le (Get-Date)) { $reset = $reset.AddDays(1) }
        return ($reset - (Get-Date)).TotalSeconds + 120
    }
    return $FallbackWaitMinutes * 60
}

# stream-json: her adım (dosya okuma, komut, arama) anında log'a düşer; masaüstü uygulaması bunu canlı gösterir.
$claudeArgs = @("--output-format", "stream-json", "--verbose")
if ($Tam) {
    $claudeArgs += "--dangerously-skip-permissions"
} else {
    # Varsayılan: dosya düzenleme + web araştırma + yaygın build/test komutları serbest, geri kalanı yasak.
    $claudeArgs += @("--permission-mode", "acceptEdits", "--allowedTools",
        "Read", "Edit", "Write", "Glob", "Grep", "WebSearch", "WebFetch",
        "Bash(git *)", "Bash(ls *)", "Bash(dotnet *)", "Bash(npm *)", "Bash(npx *)", "Bash(node *)",
        "Bash(python *)", "Bash(pytest *)", "Bash(pip *)")
}

$run = 0
while ($true) {
    # Uygulamadaki zamanlanmış görev aynı listede çalışıyorsa çakışmasın diye bekle.
    if ((Test-Path $appLock) -and ((Get-Date) - (Get-Item $appLock).LastWriteTime).TotalMinutes -lt 90) {
        Set-Durum "BEKLİYOR - uygulamadaki zamanlanmış görev bu listede çalışıyor"
        Start-Sleep -Seconds 300
        continue
    }

    try { $next = (& $sira -TaskFile $tasks | Out-String).Trim() }
    catch { Set-Durum "HATA - sira.ps1: $($_.Exception.Message)"; break }

    if ($next -match 'EYLEM:\s*YOK') {
        Set-Durum "BİTTİ - yapılacak iş yok"
        Write-Host "Yapılacak iş yok, duruyorum." -ForegroundColor Green
        break
    }
    $action = if ($next -match 'EYLEM:\s*(\S+)') { $Matches[1] } else { '?' }
    $kalan  = if ($next -match 'KALAN:\s*(.+)') { ", kalan $($Matches[1].Trim())" } else { '' }

    $run++
    $log = Join-Path $logDir "tur-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"
    Set-Durum "ÇALIŞIYOR - tur #$run, $action$kalan"
    Write-Host "`n[$(Get-Date -Format HH:mm:ss)] Tur #$run - $action$kalan" -ForegroundColor Cyan

    $prompt = "$rules`n`n# Sıradaki iş (sira.ps1 çıktısı)`n$next"
    $lines = [System.Collections.Generic.List[string]]::new()
    & claude -p $prompt @claudeArgs 2>&1 | ForEach-Object {
        $l = "$_"
        $lines.Add($l)
        Add-Content -Path $log -Value $l -Encoding utf8   # satır satır yaz ki canlı izlenebilsin
    }
    $exitCode = $LASTEXITCODE

    # Son "result" olayındaki metin turun asıl çıktısıdır; JSON hiç gelmediyse (ör. giriş hatası) ham çıktıya bakılır.
    $final = $null
    foreach ($l in $lines) {
        if ($l.StartsWith('{"type":"result"')) {
            try { $r = $l | ConvertFrom-Json; if ($r.type -eq 'result') { $final = "$($r.result)" } } catch { }
        }
    }
    $output = if ($null -ne $final) { $final } else { $lines -join "`n" }
    Write-Host $output

    # Hata mesajları kısa olur; uzun bir çıktıdaki "OAuth" ya da "rate limit" kelimesi (ör. bir araştırmada) hata sayılmaz.
    $short = $output.Trim().Length -lt 600

    if ($short -and $output -match '(?i)(failed to authenticate|oauth (session|token).{0,20}expired|please run /login|not logged in|invalid api key)') {
        # Oturum düştüyse tekrar denemek boşuna; kullanıcı giriş yapana kadar dur.
        Set-Durum "GİRİŞ GEREKLİ - 'claude setup-token' yap, sonra 'ap' ile yeniden başlat"
        Write-Host "Claude oturumu düşmüş. Giriş yapıp 'ap' ile yeniden başlat." -ForegroundColor Red
        break
    }

    if ($short -and $output -match '(?i)(usage limit|rate limit|limit reached|hit your limit)') {
        $wait = Get-ResetWaitSeconds $output
        $until = (Get-Date).AddSeconds($wait)
        Set-Durum "LİMİT - $($until.ToString('HH:mm')) saatinde devam edecek"
        Write-Host "Limit doldu, $($until.ToString('HH:mm')) saatine kadar bekleniyor..." -ForegroundColor Yellow
        Start-Sleep -Seconds ([int]$wait)
        continue
    }

    if ($exitCode -ne 0) {
        Set-Durum "HATA - exit $exitCode, 5 dk sonra tekrar"
        Start-Sleep -Seconds 300
        continue
    }

    Start-Sleep -Seconds $PauseBetweenRunsSeconds
}

Remove-Item (Join-Path $stateDir "pid") -ErrorAction SilentlyContinue
