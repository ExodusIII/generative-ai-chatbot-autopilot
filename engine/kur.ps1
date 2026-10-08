# Bir kere çalıştır: autopilot klasörünü kullanıcı PATH'ine ekler, böylece her yerden `ap` yazabilirsin.
$here = $PSScriptRoot
$path = [Environment]::GetEnvironmentVariable("Path", "User")
if (($path -split ';') -notcontains $here) {
    [Environment]::SetEnvironmentVariable("Path", "$path;$here", "User")
    Write-Host "Kuruldu. Yeni bir terminal aç ve 'ap' yaz." -ForegroundColor Green
} else {
    Write-Host "Zaten kurulu." -ForegroundColor Cyan
}
