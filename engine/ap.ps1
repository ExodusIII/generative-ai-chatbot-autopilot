<#
  ap — Claude Autopilot kısayolu. Bulunduğun klasörde çalışır.

    ap "görev"              görevi ekle (türünü Claude seçer) ve arkada başlat
    ap kod "görev"          kod yazdır
    ap ara "konu"           araştırt (sonra otomatik kontrol görevi eklenir)
    ap kontrol "hedef"      bir kodu/dokümanı/iddiayı doğrulat

  SÜRELİ: türden sonra süre yaz. Bitti deyip kapatmaz; süre dolana kadar kontrol et + düzelt + yeni şey ekle turları döner.
    ap kod 48s "görev"      48 saat boyunca geliştirir   (süre örnekleri: 90dk, 3s, 2g, 1hafta)
    ap ara 3s "konu"        3 saat boyunca araştırmayı derinleştirir
    ap uzat 12s [id]        süreli görevleri 12 saat uzat (id verilmezse hepsini)
    ap bitir [id]           süreli görevi erken bitir (son kontrol + özetle kapanır)

    ap                      bekleyen görevlerle başlat
    ap durum                ne yapıyor, kaç görev kaldı, süreli görevlerde kalan süre
    ap liste                TASKS.md'yi göster
    ap log                  son turun çıktısını göster
    ap dur                  durdur
    ap devam                takılan [!] görevleri tekrar açıp başlat
    ap sohbet               eski bir autopilot turunu seçip etkileşimli devam et
    ap uygulama             masaüstü kontrol merkezini aç (Claude Autopilot)
  Herhangi bir komuta -tam eklersen izin sormadan her şeyi yapar (sadece güvendiğin klasörde).
#>
$dir      = (Get-Location).Path
$engine   = Join-Path $PSScriptRoot "autopilot.ps1"
$tasks    = Join-Path $dir "TASKS.md"
$stateDir = Join-Path $dir ".autopilot"
$pidFile  = Join-Path $stateDir "pid"
$inv      = [Globalization.CultureInfo]::InvariantCulture
$fmt      = 'yyyy-MM-dd HH:mm'
$reBitis  = '\[biti[sş]:\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\]'
$reDur    = '^(\d+(?:[.,]\d+)?)(dk|dakika|m|s|sa|saat|h|g|gün|gun|d|hafta|w)$'

$tam   = $args -contains "-tam"
$rest  = @($args | Where-Object { $_ -ne "-tam" })
$cmd   = if ($rest.Count) { "$($rest[0])".ToLower() } else { "" }
$words = @($rest | Select-Object -Skip 1)

function Test-Running {
    if (-not (Test-Path $pidFile)) { return $false }
    $p = Get-Process -Id (Get-Content $pidFile) -ErrorAction SilentlyContinue
    return [bool]$p
}

function Initialize-Folder {
    if (-not (Test-Path $tasks)) {
        "# Görevler`n`nTürler: [kod] [araştır] [kontrol]. Süreli görev: [süre: 48 saat]. Sonuçlar sonuclar/ klasörüne yazılır.`n" | Set-Content $tasks -Encoding utf8
    }
    # Ana klasörde veya sürücü kökünde repo açma; zaten bir reponun içindeysek de açma.
    $isHome = $dir.TrimEnd('\') -ieq $HOME.TrimEnd('\') -or $dir -match '^[A-Za-z]:\\?$'
    if (-not $isHome -and -not (git -C $dir rev-parse --is-inside-work-tree 2>$null)) { git init -q $dir 2>$null }
    $gi = Join-Path $dir ".gitignore"
    if (-not (Test-Path $gi) -or -not (Select-String -Path $gi -Pattern '^\.autopilot/' -Quiet)) {
        Add-Content $gi ".autopilot/"
    }
}

function Add-Line([string]$line) {
    # Dosya satır sonu olmadan bitiyorsa yeni görev son satıra yapışmasın.
    $raw = if (Test-Path $tasks) { Get-Content $tasks -Raw -Encoding utf8 } else { '' }
    $text = if ($raw -and -not $raw.EndsWith("`n")) { [Environment]::NewLine + $line } else { $line }
    Add-Content $tasks $text -Encoding utf8
    Write-Host "Eklendi: $line" -ForegroundColor Green
}

function Start-Autopilot {
    Initialize-Folder
    if (Test-Running) { Write-Host "Zaten çalışıyor; yeni görevleri sıradaki turda alacak." -ForegroundColor Cyan; return }
    $a = "-NoProfile -ExecutionPolicy Bypass -File `"$engine`" -ProjectDir `"$dir`""
    if ($tam) { $a += " -Tam" }
    Start-Process pwsh -ArgumentList $a -WindowStyle Minimized
    Write-Host "Autopilot arkada başladı (küçültülmüş pencere). Durum için: ap durum" -ForegroundColor Cyan
}

function ConvertTo-Minutes([string]$d) {
    $null = $d -match $reDur
    $n = [double]($Matches[1] -replace ',', '.')
    switch -Regex ($Matches[2]) {
        '^(dk|dakika|m)$'      { return [int]$n }
        '^(g|gün|gun|d)$' { return [int]($n * 1440) }
        '^(hafta|w)$'          { return [int]($n * 10080) }
        default                { return [int]($n * 60) }
    }
}

function Format-Sure([string]$d) {
    $null = $d -match $reDur
    $n = $Matches[1]
    switch -Regex ($Matches[2]) {
        '^(dk|dakika|m)$'      { return "$n dakika" }
        '^(g|gün|gun|d)$' { return "$n gün" }
        '^(hafta|w)$'          { return "$n hafta" }
        default                { return "$n saat" }
    }
}

# Görev metninin başındaki süreyi ayırır: "48s site yap" ya da "48 saat site yap"
function Split-Duration([string[]]$w) {
    if ($w.Count -ge 3 -and $w[0] -match '^\d+([.,]\d+)?$' -and "$($w[0])$($w[1])" -match $reDur) {
        return [pscustomobject]@{ Sure = "$($w[0])$($w[1])"; Text = ($w | Select-Object -Skip 2) -join ' ' }
    }
    if ($w.Count -ge 2 -and $w[0] -match $reDur) {
        return [pscustomobject]@{ Sure = $w[0]; Text = ($w | Select-Object -Skip 1) -join ' ' }
    }
    return [pscustomobject]@{ Sure = $null; Text = $w -join ' ' }
}

function Add-TypedTask([string]$tag, [string[]]$w) {
    $sd = Split-Duration $w
    if (-not $sd.Text.Trim()) { Write-Host "Görev metni boş." -ForegroundColor Red; return }
    Initialize-Folder
    $parts = @()
    if ($tag)     { $parts += "[$tag]" }
    if ($sd.Sure) { $parts += "[süre: $(Format-Sure $sd.Sure)]" }
    Add-Line ("- [ ] " + (($parts + $sd.Text.Trim()) -join ' '))
    if ($sd.Sure) { Write-Host "Süreli görev: $(Format-Sure $sd.Sure) boyunca kontrol + geliştirme turları dönecek. Kalan süre için: ap durum" -ForegroundColor Cyan }
    Start-Autopilot
}

# Süreli görevlerin bitiş zamanını değiştirir (uzat / bitir).
function Edit-Deadline([string]$id, [scriptblock]$newEnd, [string]$msg) {
    if (-not (Test-Path $tasks)) { Write-Host "Bu klasörde TASKS.md yok."; return }
    $id = "$id".TrimStart('#')
    $c = @(Get-Content $tasks -Encoding utf8); $n = 0
    for ($i = 0; $i -lt $c.Count; $i++) {
        $l = $c[$i]
        if ($l -notmatch '^\s*- \[~\]') { continue }
        if ($id -and $l -notmatch "\[#$([regex]::Escape($id))\]") { continue }
        if ($l -notmatch $reBitis) { continue }
        $end = & $newEnd ([datetime]::ParseExact($Matches[1], $fmt, $inv))
        $c[$i] = $l -replace $reBitis, "[bitiş: $($end.ToString($fmt, $inv))]"
        $n++
    }
    if ($n) { Set-Content $tasks $c -Encoding utf8; Write-Host "$n süreli görev $msg." -ForegroundColor Green }
    else { Write-Host "Devam eden süreli görev bulunamadı$(if ($id) { " (#$id)" })." -ForegroundColor Yellow }
}

function Get-ToolSummary($tool) {
    foreach ($k in 'file_path', 'command', 'pattern', 'query', 'url', 'description', 'path') {
        $v = "$($tool.input.$k)"
        if ($v) { if ($v.Length -gt 120) { $v = $v.Substring(0, 120) + '…' }; return $v }
    }
    return ''
}

# Son turun kaydını okunur şekilde yazar (stream-json satırları; eski düz metin kayıtlar olduğu gibi).
function Show-Log {
    $f = Get-ChildItem (Join-Path $stateDir "logs") -Filter 'tur-*.log' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime | Select-Object -Last 1
    if (-not $f) { Write-Host "Henüz kayıt yok."; return }
    Write-Host $f.Name -ForegroundColor DarkGray
    foreach ($l in Get-Content $f.FullName -Encoding utf8) {
        if (-not $l.StartsWith('{')) { Write-Host $l; continue }
        try { $e = $l | ConvertFrom-Json } catch { Write-Host $l; continue }
        if ($e.type -eq 'assistant') {
            foreach ($c in $e.message.content) {
                if ($c.type -eq 'text' -and $c.text) { Write-Host $c.text }
                elseif ($c.type -eq 'tool_use') { Write-Host "  → $($c.name)  $(Get-ToolSummary $c)" -ForegroundColor Cyan }
            }
        } elseif ($e.type -eq 'result') {
            $dk = [math]::Round($e.duration_ms / 60000, 1)
            Write-Host "`n= Sonuç: $($e.subtype), $($e.num_turns) adım, $dk dk" -ForegroundColor Green
            Write-Host $e.result
        }
    }
}

function Show-Status {
    if (Test-Path (Join-Path $stateDir "durum.txt")) { Get-Content (Join-Path $stateDir "durum.txt") }
    else { Write-Host "Terminal autopilot bu klasörde henüz çalışmadı." }
    if (-not (Test-Running)) { Write-Host "(terminal autopilot şu an çalışmıyor)" -ForegroundColor DarkGray }
    if (-not (Test-Path $tasks)) { return }
    $c = Get-Content $tasks -Encoding utf8
    $o = @($c | Where-Object { $_ -match '^\s*- \[ \]' }).Count
    $s = @($c | Where-Object { $_ -match '^\s*- \[~\]' })
    $d = @($c | Where-Object { $_ -match '^\s*- \[x\]' }).Count
    $b = @($c | Where-Object { $_ -match '^\s*- \[!\]' }).Count
    Write-Host "Açık: $o   Süreli (devam eden): $($s.Count)   Biten: $d   Takılan: $b"
    foreach ($l in $s) {
        $kalan = 'bitiş zamanı yok'
        if ($l -match $reBitis) {
            $span = [datetime]::ParseExact($Matches[1], $fmt, $inv) - (Get-Date)
            $kalan = if ($span.TotalMinutes -gt 0) { "kalan {0} saat {1} dk" -f [math]::Floor($span.TotalHours), $span.Minutes } else { "süre doldu, kapanış turunu bekliyor" }
        }
        $id  = if ($l -match '\[#([a-z0-9]+)\]') { "#$($Matches[1])" } else { '' }
        $tur = if ($l -match '\[tur:\s*(\d+)\]') { $Matches[1] } else { '0' }
        $txt = ($l -replace '^\s*- \[~\]\s*', '') -replace '\[[^\]]*\]\s*', ''
        if ($txt.Length -gt 70) { $txt = $txt.Substring(0, 70) + '…' }
        Write-Host "  $id  $txt" -ForegroundColor Cyan
        Write-Host "         $kalan, tur $tur"
    }
}

switch -Regex ($cmd) {
    '^$'              { Start-Autopilot }
    '^durum$'         { Show-Status }
    '^liste$'         { Get-Content $tasks }
    '^log$'           { Show-Log }
    '^dur$'           { if (Test-Running) { taskkill /T /F /PID (Get-Content $pidFile) | Out-Null; Remove-Item $pidFile; Write-Host "Durduruldu." } else { Write-Host "Zaten çalışmıyor." } }
    '^devam$'         {
        # Takılan [!] görevleri tekrar açar; takılma sebebi satırda kaldığı için Claude onu görerek dener.
        $c = Get-Content $tasks
        $n = @($c | Where-Object { $_ -match '^\s*- \[!\]' }).Count
        $c -replace '^(\s*)- \[!\]', '$1- [ ]' | Set-Content $tasks -Encoding utf8
        Write-Host "$n takılan görev tekrar açıldı." -ForegroundColor Green
        Start-Autopilot
    }
    '^uzat$'          {
        if ($words.Count -lt 1 -or $words[0] -notmatch $reDur) { Write-Host "Kullanım: ap uzat 12s [id]"; break }
        $mins = ConvertTo-Minutes $words[0]
        Edit-Deadline $words[1] { param($e) $base = if ($e -lt (Get-Date)) { Get-Date } else { $e }; $base.AddMinutes($mins) } "$(Format-Sure $words[0]) uzatıldı"
    }
    '^bitir$'         { Edit-Deadline $words[0] { param($e) Get-Date } "erken bitirilecek; sıradaki turda son kontrol yapılıp kapanacak" }
    '^sohbet$'        { claude --resume }
    '^(uygulama|app)$' {
        # Kurulumda uygulama motorun yanındaki app\ klasöründe; kaynak koddan derlenince dist\ altında.
        $exe = @('..\app\ClaudeAutopilot.exe', '..\dist\ClaudeAutopilot.exe', '..\autopilot-app\dist\ClaudeAutopilot.exe') |
            ForEach-Object { Join-Path $PSScriptRoot $_ } | Where-Object { Test-Path $_ } | Select-Object -First 1
        if ($exe) { Start-Process $exe } else { Write-Host "Masaüstü uygulaması bulunamadı." -ForegroundColor Yellow }
    }
    '^kod$'           { Add-TypedTask "kod" $words }
    '^(ara|arastir|araştır)$' { Add-TypedTask "araştır" $words }
    '^kontrol$'       { Add-TypedTask "kontrol" $words }
    default           { Add-TypedTask "" $rest }
}
