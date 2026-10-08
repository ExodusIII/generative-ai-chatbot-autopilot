# Uygulamayı dist\ klasörüne derler. Çalıştır: pwsh -File publish.ps1
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
Get-Process ClaudeAutopilot -ErrorAction SilentlyContinue | Stop-Process   # açıksa dosyalar kilitli olur
dotnet publish -c Release -r win-x64 --self-contained false -o dist
Write-Host "Hazır: $PSScriptRoot\dist\ClaudeAutopilot.exe" -ForegroundColor Green
