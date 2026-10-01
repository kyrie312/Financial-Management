# 生活费「改总额」功能自测脚本
# 用法： powershell -File scripts/smoke-life-adjust.ps1
# 会真实写入测试记录并在结束时清理。

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
  if ($body) {
    $jsonText = $body | ConvertTo-Json -Depth 5 -Compress
    $params.Body = [System.Text.Encoding]::UTF8.GetBytes($jsonText)
  }
  try {
    return Invoke-RestMethod @params
  } catch {
    $status = $_.Exception.Response.StatusCode.value__
    $detail = if ($_.ErrorDetails) { $_.ErrorDetails.Message } else { $_.Exception.Message }
    return @{ __error = $true; status = $status; detail = $detail }
  }
}

$failed = 0
$now = Get-Date
$monthKey = "{0}-{1:D2}" -f $now.Year, $now.Month
$prevMonth = (Get-Date -Day 1).AddMonths(-1)
$prevMonthKey = "{0}-{1:D2}" -f $prevMonth.Year, $prevMonth.Month

function LifeSubTotal($subId, $month) {
  $q = if ($month) { "month=$month" } else { "month=all" }
  $summary = (Api "Get" "/api/summary?$q").summary
  [int](($summary.bySubcategory | Where-Object { $_.id -eq $subId }).expenseFen | Select-Object -First 1)
}
function LifeIncome($month) {
  $q = if ($month) { "month=$month" } else { "month=all" }
  $summary = (Api "Get" "/api/summary?$q").summary
  [int](($summary.byCategory | Where-Object { $_.id -eq "life" }).incomeFen | Select-Object -First 1)
}

# 备份 / 还原本月记录（改总额会替换同类记录，测完必须还原，避免影响演示数据）
# 用「金额|备注」字符串数组传递，避免 PowerShell 数组/哈希表参数绑定带来的歧义
function BackupMonthRecords($type, $subId) {
  # 明细接口没有 subcategoryId 过滤参数，按月取回来后在这里按细分过滤
  $page = (Api "Get" "/api/records?categoryId=life&type=$type&month=$monthKey&page=1").page
  $matched = $page.items | Where-Object {
    if ($subId) { $_.subcategoryId -eq $subId } else { $null -eq $_.subcategoryId }
  }
  $list = @()
  foreach ($item in $matched) {
    $list += ("{0}|{1}" -f $item.amountFen, $item.note)
  }
  return [string[]]$list
}
function RestoreMonthRecords($type, $subId, $rows) {
  # 目标总额 = 备份记录的金额之和（原始记录条数无法逐条还原时间，这里保证「总额一致」）
  $target = 0.0
  foreach ($entry in [string[]]$rows) { $target += [double]($entry.Split("|", 2)[0]) }

  # 如果当前总额已经等于目标，就不重复写入（避免重复执行脚本把数据翻倍）
  $current = if ($type -eq "income") { [double](LifeIncome $monthKey) } else { [double](LifeSubTotal $subId $monthKey) }
  if ([Math]::Abs($current - $target) -lt 0.5) {
    Write-Host "  [info] 该类别总额已与备份一致（$target 分），无需还原" -ForegroundColor DarkGray
    return
  }

  $remaining = $target - $current
  if ($remaining -le 0) {
    Write-Host "  [info] 该类别当前总额（$current 分）已超备份（$target 分），跳过还原" -ForegroundColor DarkGray
    return
  }

  $body = @{
    type          = $type
    categoryId    = "life"
    subcategoryId = $subId
    amount        = ("{0:F2}" -f ($remaining / 100))
    note          = "恢复占位"
  }
  $created = Api "Post" "/api/records" $body
  if ($created.record) {
    $patch = Api "Patch" "/api/records/$($created.record.id)" @{ note = (($rows | Select-Object -First 1) -split "\|")[1] }
    if (-not $patch.ok) { Write-Host "  [warn] 还原备注失败 #$($created.record.id)" -ForegroundColor Yellow }
    Write-Host "  [info] 已还原总额 $target 分（补写 $remaining 分）" -ForegroundColor DarkGray
  } else {
    Write-Host "  [warn] 还原记录失败：$($created.detail)" -ForegroundColor Yellow
  }
}

Section "登录"
Check ((Api "Post" "/api/auth/login" @{ password = "admin123" }).ok -eq $true) "登录成功"

$life = (Api "Get" "/api/summary?month=all").categories | Where-Object { $_.id -eq "life" }
$meal = $life.subcategories[0]
$transport = $life.subcategories[1]

# 本月基线（演示数据里本月通常已有记录，断言必须基于基线而不是 0）
$baseIncome = LifeIncome $monthKey
$baseMeal = LifeSubTotal $meal.id $monthKey
$baseTransport = LifeSubTotal $transport.id $monthKey
$baseMealOtherMonths = (LifeSubTotal $meal.id $null) - $baseMeal  # 其他所有月份合计

$backupIncome = @(BackupMonthRecords "income" $null)
$backupMeal = @(BackupMonthRecords "expense" $meal.id)
$backupTransport = @(BackupMonthRecords "expense" $transport.id)
Write-Host "  备份：收入 $($backupIncome.Count) 条 / 吃饭 $($backupMeal.Count) 条 / 交通 $($backupTransport.Count) 条"

Section "生活费收入：按金额增减（本月基线 $baseIncome 分）"
$addIncome = Api "Post" "/api/records/adjust" @{ categoryId = "life"; type = "income"; operation = "delta"; amount = "500.00"; month = $monthKey }
Check ($addIncome.ok -eq $true) "本月收入调增 500.00"
Check ((LifeIncome $monthKey) -eq ($baseIncome + 50000)) "调增后 = 基线 + 500.00"
$reduceIncome = Api "Post" "/api/records/adjust" @{ categoryId = "life"; type = "income"; operation = "delta"; amount = "-200.00"; month = $monthKey }
Check ($reduceIncome.ok -eq $true) "本月收入调减 200.00"
Check ((LifeIncome $monthKey) -eq ($baseIncome + 30000)) "调减后 = 基线 + 300.00"

Section "生活费收入：直接改成某个总额"
$setIncome = Api "Post" "/api/records/adjust" @{ categoryId = "life"; type = "income"; operation = "setTotal"; amount = "2000.00"; month = $monthKey }
Check ($setIncome.ok -eq $true -and $setIncome.result.totalFen -eq 200000) "本月收入直接改成 2000.00"
$clearIncome = Api "Post" "/api/records/adjust" @{ categoryId = "life"; type = "income"; operation = "setTotal"; amount = "0"; month = $monthKey }
Check ($clearIncome.ok -eq $true -and $clearIncome.result.totalFen -eq 0) "本月收入改成 0（清零）"
Check ((LifeIncome $monthKey) -eq 0) "清零后本月生活费收入 = 0"

Section "某类生活费开销：按金额增减（吃饭基线 $baseMeal 分）"
$addExpense = Api "Post" "/api/records/adjust" @{ categoryId = "life"; type = "expense"; subcategoryId = $meal.id; operation = "delta"; amount = "120.00"; month = $monthKey }
Check ($addExpense.ok -eq $true) "吃饭 调增 120.00"
Check ((LifeSubTotal $meal.id $monthKey) -eq ($baseMeal + 12000)) "调增后 = 基线 + 120.00"
$subExpense = Api "Post" "/api/records/adjust" @{ categoryId = "life"; type = "expense"; subcategoryId = $meal.id; operation = "delta"; amount = "-20.00"; month = $monthKey }
Check ($subExpense.ok -eq $true -and (LifeSubTotal $meal.id $monthKey) -eq ($baseMeal + 10000)) "调减 20.00 后 = 基线 + 100.00"

Section "某类生活费开销：直接改成某个总额"
$setMeal = Api "Post" "/api/records/adjust" @{ categoryId = "life"; type = "expense"; subcategoryId = $meal.id; operation = "setTotal"; amount = "600.00"; month = $monthKey }
Check ($setMeal.ok -eq $true -and (LifeSubTotal $meal.id $monthKey) -eq 60000) "吃饭 改成 600.00"
$setTransport = Api "Post" "/api/records/adjust" @{ categoryId = "life"; type = "expense"; subcategoryId = $transport.id; operation = "setTotal"; amount = "45.50"; month = $monthKey }
Check ($setTransport.ok -eq $true -and (LifeSubTotal $transport.id $monthKey) -eq 4550) "交通 改成 45.50"

Section "汇总一致性（7 类之和 = 总开销，余额 = 收入 − 开销）"
$summary = (Api "Get" "/api/summary?month=$monthKey").summary
$lifeNow = $summary.byCategory | Where-Object { $_.id -eq "life" }
$subSum = ($summary.bySubcategory | Measure-Object -Property expenseFen -Sum).Sum
Check ($subSum -eq $lifeNow.expenseFen) "7 类之和（$subSum）= 区间总开销（$($lifeNow.expenseFen)）"
Check ($lifeNow.balanceFen -eq ($lifeNow.incomeFen - $lifeNow.expenseFen)) "余额 = 收入 − 开销"

Section "非法输入与跨区间隔离"
$zeroDelta = Api "Post" "/api/records/adjust" @{ categoryId = "life"; type = "expense"; subcategoryId = $meal.id; operation = "delta"; amount = "0"; month = $monthKey }
Check ($zeroDelta.__error -eq $true -and $zeroDelta.status -eq 400) "增减金额为 0 被拒绝（400）"
$negativeResult = Api "Post" "/api/records/adjust" @{ categoryId = "life"; type = "expense"; subcategoryId = $meal.id; operation = "delta"; amount = "-9999"; month = $monthKey }
Check ($negativeResult.__error -eq $true -and $negativeResult.status -eq 400) "调减到负数被拒绝（400）"
$badSub = Api "Post" "/api/records/adjust" @{ categoryId = "life"; type = "expense"; operation = "setTotal"; amount = "10"; month = $monthKey }
Check ($badSub.__error -eq $true -and $badSub.status -eq 400) "生活费开销缺细分类型被拒绝（400）"

# 区间隔离：被改的只有本月，其他月份与累计的关系仍然成立
$allTime = LifeSubTotal $meal.id $null
$thisNow = LifeSubTotal $meal.id $monthKey
Check (($allTime - $thisNow) -eq $baseMealOtherMonths) "其他月份合计未受影响（$baseMealOtherMonths 分）"
Check ($allTime -eq ($baseMealOtherMonths + $thisNow)) "累计（$allTime）= 其他月份（$baseMealOtherMonths）+ 本月（$thisNow）"

Section "还原测试前的本月数据"
$cleanup = Api "Post" "/api/records/adjust" @{ categoryId = "life"; type = "expense"; subcategoryId = $meal.id; operation = "setTotal"; amount = "0"; month = $monthKey }
$cleanup2 = Api "Post" "/api/records/adjust" @{ categoryId = "life"; type = "expense"; subcategoryId = $transport.id; operation = "setTotal"; amount = "0"; month = $monthKey }
$cleanupIncome = Api "Post" "/api/records/adjust" @{ categoryId = "life"; type = "income"; operation = "setTotal"; amount = "0"; month = $monthKey }
Check ($cleanup.ok -eq $true -and $cleanup2.ok -eq $true -and $cleanupIncome.ok -eq $true) "测试写入的记录已清除"

RestoreMonthRecords "income" $null $backupIncome
RestoreMonthRecords "expense" $meal.id $backupMeal
RestoreMonthRecords "expense" $transport.id $backupTransport
Check ((LifeIncome $monthKey) -eq $baseIncome) "本月生活费收入已还原为 $baseIncome 分"
Check ((LifeSubTotal $meal.id $monthKey) -eq $baseMeal) "本月吃饭金额已还原为 $baseMeal 分"
Check ((LifeSubTotal $transport.id $monthKey) -eq $baseTransport) "本月交通金额已还原为 $baseTransport 分"

Write-Host ""
if ($failed -eq 0) {
  Write-Host "生活费改总额功能全部检查通过 ✅" -ForegroundColor Green
} else {
  Write-Host "有 $failed 项检查未通过 ❌" -ForegroundColor Red
  exit 1
}
