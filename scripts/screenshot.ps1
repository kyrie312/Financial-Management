# 仅用于开发期视觉检查：用无头 Chrome 给页面截图
# 用法： powershell -File scripts/screenshot.ps1
# 前置条件：开发服务器正在运行，且以 ALLOW_LOCAL_PREVIEW=1 启动（仅本机预览用）

$projectRoot = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $projectRoot "screenshots"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

$chrome = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $chrome) { throw "没有找到 Chrome 或 Edge" }

$base = if ($env:SMOKE_BASE) { $env:SMOKE_BASE } else { "http://127.0.0.1:3178" }
$profile = Join-Path $env:TEMP "dsh-shot-profile"

$targets = @(
  @{ name = "01-home"; url = "/"; w = 430; h = 950 },
  @{ name = "02-home-wide"; url = "/"; w = 1280; h = 900 },
  @{ name = "03-life"; url = "/life"; w = 430; h = 1400 },
  @{ name = "04-side"; url = "/side"; w = 430; h = 1400 },
  @{ name = "05-school"; url = "/school"; w = 430; h = 1200 },
  @{ name = "06-settings"; url = "/settings"; w = 430; h = 900 },
  @{ name = "07-login"; url = "/login"; w = 430; h = 800 }
)

foreach ($t in $targets) {
  $out = Join-Path $outDir "$($t.name).png"
  if (Test-Path $out) { Remove-Item -Force $out }
  & $chrome --headless=new --disable-gpu --hide-scrollbars --no-first-run --no-default-browser-check `
    "--user-data-dir=$profile" --window-size="$($t.w),$($t.h)" `
    "--screenshot=$out" --virtual-time-budget=4000 "$base$($t.url)" 2>$null | Out-Null
  if (Test-Path $out) {
    Write-Host ("[OK] {0}  ({1} bytes)" -f $t.name, (Get-Item $out).Length)
  } else {
    Write-Host ("[FAIL] {0}" -f $t.name)
  }
}
