<#
  sira.ps1 — TASKS.md'de sıradaki işi seçer ve Claude'a ne yapacağını söyler.
  Süre ve "görev kapandı mı" kararı burada verilir: Claude "bitti" dese bile süreli görev, süresi dolmadan kapanmaz.

  Kutucuklar: [ ] açık   [~] süreli, devam ediyor   [x] bitti   [!] takıldı
  Etiketler:  [süre: 48 saat]            başlamamış süreli görev (`ap kod 48s "..."` yazar ya da elle eklenir)
              [başladı: 2026-09-30 14:30] görev başlayınca eklenir (ilerleme çubuğu için)
              [bitiş: 2026-10-02 14:30]  görev başlayınca eklenir; bu saatten sonra kapanış turu verilir
              [tur: 3]                   kaçıncı tur
              [#k7p2]                    kimlik; turlar arası hafıza sonuclar/gunluk-k7p2.md dosyasında

  Öncelik: 1) süresi dolan süreli görevin kapanışı  2) ilk açık görev  3) en az tur almış süreli görevin yeni turu
  Çıktı:   "EYLEM: NORMAL | DÖNGÜ | BİTİR | YOK" ve ayrıntı satırları.
#>
param([Parameter(Mandatory)] [string]$TaskFile)

$ErrorActionPreference = 'Stop'
$inv      = [Globalization.CultureInfo]::InvariantCulture
$fmt      = 'yyyy-MM-dd HH:mm'
$now      = Get-Date
$TaskFile = (Resolve-Path $TaskFile).Path
$root     = Split-Path -Parent $TaskFile
$lines    = @(Get-Content $TaskFile -Encoding utf8)
$changed  = $false
$notes    = @()

# Türkçe harfler \u kaçışıyla yazıldı ki betiğin kodlaması ne olursa olsun eşleşsin.
$reTask  = '^(\s*)- \[([ ~xX!])\]\s?(.*)$'
$reSure  = '\[s[uü]re:\s*([^\]]+)\]'
$reBitis = '\[biti[sş]:\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\]'
$reTur   = '\[tur:\s*(\d+)\]'
$reId    = '\[#([a-z0-9]+)\]'
$reType  = '^(\[(?:kod|ara[sş]t[iı]r|kontrol)\]\s*)?(.*)$'

function ConvertTo-Minutes([string]$s) {
    if ($s -notmatch '(\d+(?:[.,]\d+)?)\s*([^\d\s]*)') { return 0 }
    $n = [double]($Matches[1] -replace ',', '.')
    switch -Regex ($Matches[2]) {
        '^(dk|dak|dakika|m|min|minutes?)$' { return [int]$n }
        '^(g|g[uü]n|d|days?)$'        { return [int]($n * 1440) }
        '^(hafta|w|weeks?)$'                { return [int]($n * 10080) }
        default                             { return [int]($n * 60) }   # s, sa, saat, h, hours ya da birimsiz
    }
}

function Format-Kalan([datetime]$end) {
    $span = $end - $now
    if ($span.TotalMinutes -le 0) { return '0 dk (süre doldu)' }
    $h = [int][math]::Floor($span.TotalHours)
    if ($h -gt 0) { return "$h saat $($span.Minutes) dk" }
    return "$($span.Minutes) dk"
}

function New-Id {
    $used = foreach ($l in $script:lines) { foreach ($m in [regex]::Matches($l, $reId, 'IgnoreCase')) { $m.Groups[1].Value } }
    $abc  = 'abcdefghijkmnpqrstuvwxyz23456789'
    do { $id = -join (1..4 | ForEach-Object { $abc[(Get-Random -Maximum $abc.Length)] }) } while ($used -contains $id)
    return $id
}

# Etiket varsa değiştirir, yoksa tür etiketinin hemen arkasına ekler.
function Set-Tag([string]$text, [string]$pattern, [string]$tag) {
    if ($text -match $pattern) { return ($text -replace $pattern, $tag) }
    $null = $text -match $reType
    return "$($Matches[1])$tag $($Matches[2])"
}

function Save-Line($t, [string]$box, [string]$text) {
    $script:lines[$t.Index] = "$($t.Indent)- [$box] $text"
    $t.Box = $box; $t.Text = $text
    $script:changed = $true
}

function Get-Type([string]$text) {
    if ($text -match '^\[kod\]') { return 'kod' }
    if ($text -match '^\[ara[sş]t[iı]r\]') { return 'araştır' }
    if ($text -match '^\[kontrol\]') { return 'kontrol' }
    return 'belirsiz (işe bakıp en uygun türü sen seç)'
}

# Görev satırlarını oku
$tasks = @(for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match $reTask) {
        $t = [pscustomobject]@{ Index = $i; Indent = $Matches[1]; Box = $Matches[2]; Text = $Matches[3]; End = $null; Tur = 0; Id = $null }
        $d = [datetime]::MinValue
        if ($t.Text -match $reBitis -and [datetime]::TryParseExact($Matches[1], $fmt, $inv, 'None', [ref]$d)) { $t.End = $d }
        if ($t.Text -match $reTur) { $t.Tur = [int]$Matches[1] }
        if ($t.Text -match $reId)  { $t.Id  = $Matches[1] }
        $t
    }
})

# Süresi dolmadan [x] yapılmış süreli görevi geri aç: süreli görevi sadece BİTİR kapatır.
foreach ($t in $tasks) {
    if ($t.Box -eq 'x' -and $t.End -and $t.End -gt $now) {
        Save-Line $t '~' $t.Text
        $notes += "NOT: [#$($t.Id)] süresi dolmadan kapatılmıştı, yeniden açıldı. Süreli görevi sadece BİTİR eylemi kapatır."
    }
}

# Kimliği olmayan süreli görevlere kimlik ver (elle yazılmış olabilir).
foreach ($t in $tasks) {
    if ($t.Box -eq '~' -and $t.End -and -not $t.Id) {
        $t.Id = New-Id
        Save-Line $t '~' (Set-Tag $t.Text $reId "[#$($t.Id)]")
    }
}

$action = $null; $pick = $null; $first = $false

# 1) Süresi dolan süreli görev → kapanış
$pick = $tasks | Where-Object { $_.Box -eq '~' -and $_.End -and $_.End -le $now } | Select-Object -First 1
if ($pick) { $action = 'BİTİR' }

# 2) İlk açık görev (süre etiketi varsa süreli göreve çevrilir)
if (-not $action) {
    $pick = $tasks | Where-Object { $_.Box -eq ' ' -or ($_.Box -eq '~' -and -not $_.End) } | Select-Object -First 1
    if ($pick) {
        $action = 'NORMAL'
        if ($pick.Text -match $reSure) {
            $sureText = $Matches[1]
            $mins = ConvertTo-Minutes $sureText
            if ($mins -ge 1) {
                $end  = $now.AddMinutes($mins)
                $id   = New-Id
                $body = ($pick.Text -replace "\s*$reSure", '').Trim()
                $null = $body -match $reType
                $head = if ($Matches[1]) { $Matches[1].Trim() + ' ' } else { '' }
                $rest = $Matches[2]
                $pick.End = $end; $pick.Tur = 1; $pick.Id = $id
                Save-Line $pick '~' "$head[başladı: $($now.ToString($fmt, $inv))] [bitiş: $($end.ToString($fmt, $inv))] [tur: 1] [#$id] $rest"
                $action = 'DÖNGÜ'; $first = $true
            } else {
                $notes += "UYARI: '[süre: $sureText]' anlaşılamadı. Görevi yapma; etiketi '[süre: 12 saat]' gibi sayı + dakika/saat/gün biçimine çevir ve dur."
            }
        }
    }
}

# 3) Süresi devam eden süreli görevlerden en az tur almış olanın yeni turu (birden fazlaysa sırayla döner)
if (-not $action) {
    $pick = $tasks | Where-Object { $_.Box -eq '~' -and $_.End -and $_.End -gt $now } | Sort-Object Tur, Index | Select-Object -First 1
    if ($pick) {
        $pick.Tur++
        Save-Line $pick '~' (Set-Tag $pick.Text $reTur "[tur: $($pick.Tur)]")
        $action = 'DÖNGÜ'
    }
}

if ($changed) { Set-Content -Path $TaskFile -Value $lines -Encoding utf8 }

if ($action) {
    $out = @(
        "EYLEM: $action"
        "SATIR: $($pick.Index + 1)"
        "GÖREV: $($pick.Text)"
        "TÜR: $(Get-Type $pick.Text)"
        "KLASÖR: $root"
    )
    if ($action -ne 'NORMAL') {
        $out += "TUR: $($pick.Tur)"
        if ($action -eq 'DÖNGÜ') { $out += "İLK TUR: $(if ($first) { 'evet' } else { 'hayır' })" }
        $out += "BİTİŞ: $($pick.End.ToString($fmt, $inv))"
        $out += "KALAN: $(Format-Kalan $pick.End)"
        $out += "GÜNLÜK: $(Join-Path $root "sonuclar\gunluk-$($pick.Id).md")"
    }
} else {
    $out = @('EYLEM: YOK', 'Açık görev yok ve süresi devam eden süreli görev yok.')
}
$out += $notes

# Masaüstü uygulaması için: şu an hangi iş verildi? (hata olursa sıra kararını etkilemesin)
try {
    $stateDir = Join-Path $root '.autopilot'
    New-Item -ItemType Directory -Force $stateDir | Out-Null
    (@("ZAMAN: $($now.ToString($fmt, $inv))") + $out) | Set-Content (Join-Path $stateDir 'simdi.txt') -Encoding utf8
} catch { }

$out
