# 停止 3178 端口上的本地服务，并把数据库的 WAL 日志合并（checkpoint）进 ledger.db
# 供「停止网站.bat」调用
$ErrorActionPreference = "Continue"
$port = if ($env:PORT) { [int]$env:PORT } else { 3178 }

$connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($connections) {
  $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($processId in $pids) {
    try {
      Stop-Process -Id $processId -Force -ErrorAction Stop
      Write-Host ("已停止服务进程 PID " + $processId) -ForegroundColor Green
    } catch {
      Write-Host ("停止 PID " + $processId + " 失败：" + $_.Exception.Message) -ForegroundColor Red
    }
  }
  Start-Sleep -Seconds 2
} else {
  Write-Host ($port.ToString() + " 端口上没有正在运行的服务。") -ForegroundColor Yellow
}

# 关键一步：把 -wal 里的数据合并回 ledger.db，这样 ledger.db 才能单独复制到另一台电脑
$nodeExe = "node"
$bundled = "C:\Users\马益坤\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
if (Test-Path $bundled) { $nodeExe = $bundled }
$checkpoint = Join-Path $PSScriptRoot "checkpoint.mjs"
if (Test-Path $checkpoint) {
  Write-Host ""
  Write-Host "正在合并数据库日志（这样 ledger.db 才能单独复制走）..." -ForegroundColor Cyan
  & $nodeExe $checkpoint
}

Write-Host ""
if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
  Write-Host "端口仍被占用，请手动关闭启动网站的那个窗口。" -ForegroundColor Yellow
} else {
  Write-Host "服务已停止，可以安全关闭启动网站的那个窗口了。" -ForegroundColor Green
  Write-Host "数据保存在 data\ledger.db，下次启动还在。"
}
Write-Host ""
Start-Sleep -Seconds 5
