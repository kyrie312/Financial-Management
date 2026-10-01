# 回归测试：新增记录后「累计」统计必须立刻跟着变（防止"累计恒为 0"这类 bug 复现）
# 用法： powershell -File scripts/smoke-dashboard.ps1
# 会真实写入几条记录，结束时清理掉。

$ErrorActionPreference = "Stop"
$base = if ($env:SMOKE_BASE) { $env:SMOKE_BASE } else { "http://127.0.0.1:3178" }
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

function Section($text) { Write-Host "`n=== $text ===" -ForegroundColor Cyan }
function Ok($text) { Write-Host "  [OK] $text" -ForegroundColor Green }
function Fail($text) { Write-Host "  [FAIL] $text" -ForegroundColor Red; $script:failed += 1 }
function Check($condition, $text) { if ($condition) { Ok $text } else { Fail $text } }

function Api($method, $path, $body) {
  $params = @{
    Uri         = "$base$path"
    Method      = $method
    WebSession  = $session
    ContentType = "application/json; charset=utf-8"
  }
  if ($body) { $params.Body = [System.Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json -Depth 5 -Compress)) }
  try { return Invoke-RestMethod @params }
  catch {
    return @{ __error = $true; status = $_.Exception.Response.StatusCode.value__; detail = $_.ErrorDetails.Message }
  }
}

$failed = 0
$createdIds = @()
$now = Get-Date
$monthKey = "{0}-{1:D2}" -f $now.Year, $now.Month

Section "登录"
Check ((Api "Post" "/api/auth/login" @{ password = $env:SMOKE_PASSWORD ?? "Mayikun20040312" }).ok -eq $true) "登录成功"

Section "记录基线"
$before = (Api "Get" "/api/summary?month=all").summary
$beforeMonth = (Api "Get" "/api/summary?month=$monthKey").summary
Write-Host "  累计：收入 $($before.total.incomeFen) / 开销 $($before.total.expenseFen) 分"
Write-Host "  $monthKey：收入 $($beforeMonth.total.incomeFen) / 开销 $($beforeMonth.total.expenseFen) 分"

Section "写入「本月」的收入和开销（这正是触发过 bug 的场景）"
$income = Api "Post" "/api/records" @{ type = "income"; categoryId = "side"; amount = "12.34"; note = "回归测试-本月收入" }
Check ($income.ok -eq $true) "本月收入 12.34 记录成功"
if ($income.record) { $createdIds += $income.record.id }

$life = (Api "Get" "/api/summary?month=all").categories | Where-Object { $_.id -eq "life" }
$meal = $life.subcategories[0]
$expense = Api "Post" "/api/records" @{ type = "expense"; categoryId = "life"; subcategoryId = $meal.id; amount = "5.67"; note = "回归测试-本月开销" }
Check ($expense.ok -eq $true) "本月开销 5.67 记录成功"
if ($expense.record) { $createdIds += $expense.record.id }

Section "关键断言：累计必须立刻跟着变化"
$after = (Api "Get" "/api/summary?month=all").summary
$afterMonth = (Api "Get" "/api/summary?month=$monthKey").summary

Check ($after.total.incomeFen -eq ($before.total.incomeFen + 1234)) `
  "累计收入 = 原值 + 12.34（$($before.total.incomeFen) → $($after.total.incomeFen)）"
Check ($after.total.expenseFen -eq ($before.total.expenseFen + 567)) `
  "累计开销 = 原值 + 5.67（$($before.total.expenseFen) → $($after.total.expenseFen)）"
Check ($afterMonth.total.incomeFen -eq ($beforeMonth.total.incomeFen + 1234)) `
  "本月收入 = 原值 + 12.34（$($beforeMonth.total.incomeFen) → $($afterMonth.total.incomeFen)）"
Check ($after.total.balanceFen -eq ($after.total.incomeFen - $after.total.expenseFen)) "累计余额 = 累计收入 − 累计开销"
Check ($after.total.balanceFen -ne 0 -or $before.total.balanceFen -eq 0) "累计余额不是被清成 0（$($after.total.balanceFen) 分）"

$lifeAfter = $after.byCategory | Where-Object { $_.id -eq "life" }
$sideAfter = $after.byCategory | Where-Object { $_.id -eq "side" }
Check ($sideAfter.incomeFen -eq ((($before.byCategory | Where-Object { $_.id -eq "side" }).incomeFen) + 1234)) `
  "副业累计收入也同步更新（$($sideAfter.incomeFen) 分）"
Check ($lifeAfter.expenseFen -eq ((($before.byCategory | Where-Object { $_.id -eq "life" }).expenseFen) + 567)) `
  "生活费累计开销也同步更新（$($lifeAfter.expenseFen) 分）"

Section "页面渲染里的累计金额也要正确"
$page = (Invoke-WebRequest -Uri "$base/" -WebSession $session -UseBasicParsing).Content
$expected = "{0:N2}" -f ($after.total.balanceFen / 100)
Check ($page -match [regex]::Escape($expected)) "主页 HTML 里出现累计余额 ¥$expected"

Section "明细接口（累计口径）与本月的合计一致"
$incomePage = (Api "Get" "/api/records?categoryId=side&type=income&month=all&page=1").page
$monthSum = ($incomePage.items | Where-Object { $true } | Measure-Object -Property amountFen -Sum).Sum
Check ($incomePage.total -ge 1) "副业收入明细条数 = $($incomePage.total)"
Check ($sideAfter.incomeFen -ge $monthSum) "累计收入不小于明细可见金额之和"

Section "清理"
foreach ($id in $createdIds) {
  $r = Api "Delete" "/api/records/$id"
  if ($r.ok -eq $true) { Ok "已删除测试记录 #$id" } else { Fail "清理记录 #$id 失败" }
}
$final = (Api "Get" "/api/summary?month=all").summary
Check ($final.total.incomeFen -eq $before.total.incomeFen -and $final.total.expenseFen -eq $before.total.expenseFen) `
  "数据已还原（收入 $($final.total.incomeFen) / 开销 $($final.total.expenseFen) 分）"

Write-Host ""
if ($failed -eq 0) {
  Write-Host "累计统计回归测试全部通过 ✅" -ForegroundColor Green
} else {
  Write-Host "有 $failed 项检查未通过 ❌" -ForegroundColor Red
  exit 1
}
