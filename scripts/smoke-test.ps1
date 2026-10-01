# 生活开销记账 · 接口自测脚本
# 用法： pwsh -File scripts/smoke-test.ps1
# 会真实地往数据库里写测试记录，并在结束时删除它们。

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
    # 必须显式用 UTF-8 字节发送：Windows PowerShell 5.1 默认按 ANSI(GBK) 编码 body，会把中文变问号
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
$createdIds = @()

Section "登录"
$login = Api "Post" "/api/auth/login" @{ password = "admin123" }
Check ($login.ok -eq $true) "使用密码登录成功"

# 开发预览旁路（仅本机 dev 生效）会放行未登录请求，此时跳过这一项
$bareSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
try {
  Invoke-RestMethod -Uri "$base/api/summary" -Method Get -WebSession $bareSession | Out-Null
  Write-Host "  [SKIP] 本机开发模式启用了预览旁路，未登录也能访问（生产构建下会返回 401）" -ForegroundColor Yellow
} catch {
  Check ($_.Exception.Response.StatusCode.value__ -eq 401) "未登录访问接口返回 401"
}

Section "主页与各详情页渲染"
foreach ($path in @("/", "/life", "/side", "/school", "/settings")) {
  $page = Invoke-WebRequest -Uri "$base$path" -WebSession $session -UseBasicParsing
  Check ($page.StatusCode -eq 200 -and $page.Content.Length -gt 1000) "GET $path 正常（$($page.Content.Length) 字节）"
}

Section "记一笔生活费收入（无备注，允许）"
$lifeIncome = Api "Post" "/api/records" @{ type = "income"; categoryId = "life"; amount = "1500.00"; note = "" }
Check ($lifeIncome.ok -eq $true) "生活费收入 1500.00 记录成功"
if ($lifeIncome.record) { $createdIds += $lifeIncome.record.id }

Section "记一笔副业收入（备注必填 → 空备注必须被拒绝）"
$rejected = Api "Post" "/api/records" @{ type = "income"; categoryId = "side"; amount = "300"; note = "   " }
Check ($rejected.__error -eq $true -and $rejected.status -eq 400) "副业收入空备注被拒绝（400）"
$sideIncome = Api "Post" "/api/records" @{ type = "income"; categoryId = "side"; amount = "300.50"; note = "帮同学写代码" }
Check ($sideIncome.ok -eq $true) "副业收入 300.50（带备注）记录成功"
if ($sideIncome.record) { $createdIds += $sideIncome.record.id }

Section "记一笔学校补助收入"
$schoolIncome = Api "Post" "/api/records" @{ type = "income"; categoryId = "school"; amount = "800"; note = "国家助学金" }
Check ($schoolIncome.ok -eq $true) "学校补助收入 800 记录成功"
if ($schoolIncome.record) { $createdIds += $schoolIncome.record.id }

Section "生活费开销：必须选细分类型"
$noSub = Api "Post" "/api/records" @{ type = "expense"; categoryId = "life"; amount = "20"; note = "" }
Check ($noSub.__error -eq $true -and $noSub.status -eq 400) "生活费开销未选细分类型被拒绝（400）"

$categories = (Api "Get" "/api/summary?month=all").categories
$life = $categories | Where-Object { $_.id -eq "life" }
Check ($life.subcategories.Count -eq 7) "生活费细分类型共 7 个：$(($life.subcategories | ForEach-Object { $_.name }) -join '、')"
$meal = $life.subcategories[0]
$transport = $life.subcategories[1]
Check ($meal.name -eq "吃饭" -and $transport.name -eq "交通") "细分类型顺序为：吃饭、交通、…"

$mealExpense = Api "Post" "/api/records" @{ type = "expense"; categoryId = "life"; subcategoryId = $meal.id; amount = "35.80"; note = "" }
Check ($mealExpense.ok -eq $true) "生活费开销（吃饭）35.80 记录成功"
if ($mealExpense.record) { $createdIds += $mealExpense.record.id }

$transportExpense = Api "Post" "/api/records" @{ type = "expense"; categoryId = "life"; subcategoryId = $transport.id; amount = "4.20"; note = "地铁" }
Check ($transportExpense.ok -eq $true) "生活费开销（交通）4.20 记录成功"
if ($transportExpense.record) { $createdIds += $transportExpense.record.id }

Section "副业开销"
$sideExpense = Api "Post" "/api/records" @{ type = "expense"; categoryId = "side"; amount = "120"; note = "买显示器支架" }
Check ($sideExpense.ok -eq $true) "副业开销 120（带备注）记录成功"
if ($sideExpense.record) { $createdIds += $sideExpense.record.id }

Section "统计汇总（累计）"
$summary = (Api "Get" "/api/summary?month=all").summary
$lifeSummary = $summary.byCategory | Where-Object { $_.id -eq "life" }
$sideSummary = $summary.byCategory | Where-Object { $_.id -eq "side" }
$schoolSummary = $summary.byCategory | Where-Object { $_.id -eq "school" }

Check ($lifeSummary.incomeFen -ge 150000) "生活费收入累计 = $($lifeSummary.incomeFen) 分（含本脚本写入的 1500 元）"
Check ($lifeSummary.expenseFen -ge 4000) "生活费开销累计 = $($lifeSummary.expenseFen) 分"
Check ($lifeSummary.balanceFen -eq ($lifeSummary.incomeFen - $lifeSummary.expenseFen)) "生活费余额 = 收入 − 开销"
Check ($sideSummary.balanceFen -eq ($sideSummary.incomeFen - $sideSummary.expenseFen)) "副业余额 = 收入 − 开销"
Check ($schoolSummary.incomeFen -ge 80000) "学校补助收入累计含 800 元"

$subSum = ($summary.bySubcategory | Measure-Object -Property expenseFen -Sum).Sum
Check ($subSum -eq $lifeSummary.expenseFen) "7 个细分开销之和（$subSum）= 生活费总开销（$($lifeSummary.expenseFen)）"

$totalCheck = ($summary.byCategory | Measure-Object -Property balanceFen -Sum).Sum
Check ($summary.total.balanceFen -eq $totalCheck) "总余额 = 三个板块余额之和"

Section "月份区间筛选"
$now = Get-Date
$monthKey = "{0}-{1:D2}" -f $now.Year, $now.Month
$monthSummary = (Api "Get" "/api/summary?month=$monthKey").summary
Check ($monthSummary.total.incomeFen -gt 0) "$monthKey 月份统计能取到本月数据（收入 $($monthSummary.total.incomeFen) 分）"
$oldSummary = (Api "Get" "/api/summary?month=2000-01").summary
Check ($oldSummary.total.incomeFen -eq 0 -and $oldSummary.total.expenseFen -eq 0) "2000-01 无数据时统计为 0（不报错）"

Section "明细分页与排序"
$incomePage = Api "Get" "/api/records?categoryId=side&type=income&month=all&page=1"
Check ($incomePage.page.items.Count -ge 1) "副业收入明细可读取（$($incomePage.page.items.Count) 条）"
Check ($incomePage.page.pageSize -eq 10) "每页固定 10 条"
$onlyIncome = @($incomePage.page.items | Where-Object { $_.type -ne "income" }).Count -eq 0
Check $onlyIncome "副业收入明细里不混入开销"

# 临时造 12 条副业收入，用来真正验证翻页与排序（测完删除）
$pagingIds = @()
for ($i = 1; $i -le 12; $i++) {
  $created = Api "Post" "/api/records" @{ type = "income"; categoryId = "side"; amount = "10.00"; note = "分页测试 #$i" }
  if ($created.record) { $pagingIds += $created.record.id }
}
Check ($pagingIds.Count -eq 12) "创建 12 条分页测试记录"

$p1 = (Api "Get" "/api/records?categoryId=side&type=income&month=all&page=1").page
$p2 = (Api "Get" "/api/records?categoryId=side&type=income&month=all&page=2").page
$overlap = @($p1.items.id | Where-Object { $p2.items.id -contains $_ }).Count
Check ($p1.items.Count -eq 10) "第 1 页正好 10 条"
Check ($p2.items.Count -eq ($p1.total - 10)) "第 2 页为剩余 $($p1.total - 10) 条"
Check ($overlap -eq 0) "两页之间没有重复记录"
Check ($p1.totalPages -eq [Math]::Ceiling($p1.total / 10)) "总页数 = 总数 / 每页 10 条（$($p1.totalPages) 页 / $($p1.total) 条）"

$keys = @()
foreach ($item in @($p1.items) + @($p2.items)) {
  $keys += [double]$item.occurredAt * 1000000 + [double]$item.id
}
$descending = $true
for ($i = 1; $i -lt $keys.Count; $i++) {
  if ($keys[$i] -gt $keys[$i - 1]) { $descending = $false; break }
}
Check $descending "跨页顺序为「时间倒序 + id 倒序」（共 $($keys.Count) 条）"

foreach ($tempId in $pagingIds) { Api "Delete" "/api/records/$tempId" | Out-Null }
$afterCleanup = (Api "Get" "/api/records?categoryId=side&type=income&month=all&page=1").page
Check ($afterCleanup.total -eq ($p1.total - 12)) "分页测试记录已清理（$($p1.total) → $($afterCleanup.total) 条）"

Section "编辑记录（改金额 / 改备注 / 改类型）"
$targetId = $mealExpense.record.id
$edited = Api "Patch" "/api/records/$targetId" @{ amount = "40.00"; note = "改成 40 元" }
Check ($edited.ok -eq $true -and $edited.record.amountFen -eq 4000 -and $edited.record.note -eq "改成 40 元") "改金额 + 改备注成功（金额=$($edited.record.amountFen) 分，备注=$($edited.record.note)）"

# 另外拿一条已有记录做「改金额」测试，测完必须还原，避免影响演示/真实数据
$restoreTarget = (Api "Get" "/api/records?categoryId=life&type=expense&month=all&page=1").page.items |
  Where-Object { $_.note -notlike "*[[]demo[]]*" -and $_.note -notlike "*分页测试*" } |
  Select-Object -First 1
if ($restoreTarget) {
  $beforeAmount = $restoreTarget.amountFen
  $beforeNote = $restoreTarget.note
  $bumped = Api "Patch" "/api/records/$($restoreTarget.id)" @{ amount = ("{0:F2}" -f (($beforeAmount + 200) / 100)) }
  Check ($bumped.ok -eq $true -and $bumped.record.amountFen -eq ($beforeAmount + 200)) "已有记录改金额生效（$beforeAmount → $($bumped.record.amountFen) 分）"
  $restored = Api "Patch" "/api/records/$($restoreTarget.id)" @{ amount = ("{0:F2}" -f ($beforeAmount / 100)); note = $beforeNote }
  Check ($restored.ok -eq $true -and $restored.record.amountFen -eq $beforeAmount) "已还原为原金额（$beforeAmount 分）"
} else {
  Write-Host "  [SKIP] 没有可用来测「改已有记录」的数据" -ForegroundColor Yellow
}

$lifeSub = $categories | Where-Object { $_.id -eq "life" }
$gift = $lifeSub.subcategories[4]
Check ($gift.name -eq "礼物") "细分类型第 5 项是礼物"
$movedSub = Api "Patch" "/api/records/$targetId" @{ subcategoryId = $gift.id }
Check ($movedSub.record.subcategoryName -eq "礼物") "生活费细分类型 吃饭 → 礼物 修改成功"

$movedCategory = Api "Patch" "/api/records/$targetId" @{ categoryId = "side"; subcategoryId = $null; type = "expense"; note = "改到副业板块" }
Check ($movedCategory.record.categoryId -eq "side" -and $movedCategory.record.subcategoryName -eq $null) "板块 生活费 → 副业（清空细分）修改成功"

$backToLife = Api "Patch" "/api/records/$targetId" @{ categoryId = "life"; subcategoryId = $meal.id; note = "" }
Check ($backToLife.record.categoryId -eq "life") "改回生活费（吃饭）成功"

$noteRequired = Api "Patch" "/api/records/$( $sideIncome.record.id )" @{ note = "" }
Check ($noteRequired.__error -eq $true -and $noteRequired.status -eq 400) "把副业记录的备注清空被拒绝（400）"

$afterEdit = (Api "Get" "/api/summary?month=all").summary
$lifeAfter = $afterEdit.byCategory | Where-Object { $_.id -eq "life" }
Check ($lifeAfter.expenseFen -ge 4420) "改金额后生活费总开销已重算（$($lifeAfter.expenseFen) 分）"

# 校验「改回来」之后总额也回到了原值（防止测试留下痕迹）
if ($restoreTarget) {
  $lifeRestored = ((Api "Get" "/api/summary?month=all").summary.byCategory | Where-Object { $_.id -eq "life" })
  Check ($lifeRestored.expenseFen -eq $lifeAfter.expenseFen) "还原后统计与还原前一致（$($lifeRestored.expenseFen) 分）"
}

Section "删除记录并重算"
$beforeDelete = (Api "Get" "/api/summary?month=all").summary.total.expenseFen
$deleteTarget = $transportExpense.record.id
$deleted = Api "Delete" "/api/records/$deleteTarget"
Check ($deleted.ok -eq $true) "删除生活费开销 4.20 成功"
$createdIds = $createdIds | Where-Object { $_ -ne $deleteTarget }
$afterDelete = (Api "Get" "/api/summary?month=all").summary.total.expenseFen
Check ($afterDelete -eq $beforeDelete - 420) "删除后总开销精确减少 4.20（$beforeDelete → $afterDelete 分）"

$repeatDelete = Api "Delete" "/api/records/$deleteTarget"
Check ($repeatDelete.__error -eq $true -and $repeatDelete.status -eq 404) "重复删除返回 404"

Section "CSV 导出"
$csv = Invoke-WebRequest -Uri "$base/api/records?format=csv" -WebSession $session -UseBasicParsing
Check ($csv.StatusCode -eq 200) "CSV 导出返回 200"
Check ($csv.Content -match "日期,时间,方向,板块,细分类型,金额\(元\),备注") "CSV 表头正确"
Check ($csv.Content -match "副业") "CSV 中包含记录内容"

Section "登录保护与密码"
$badLogin = Api "Post" "/api/auth/login" @{ password = "wrong-password" }
Check ($badLogin.__error -eq $true -and $badLogin.status -eq 401) "错误密码被拒绝（401）"
$profile = Api "Get" "/api/auth"
Check ($profile.username -eq "admin") "登录信息接口返回用户名"

Section "清理测试数据"
foreach ($id in $createdIds) {
  $result = Api "Delete" "/api/records/$id"
  if ($result.ok -eq $true) { Ok "已删除测试记录 #$id" } else { Fail "清理记录 #$id 失败" }
}
$final = (Api "Get" "/api/summary?month=all").summary
Write-Host "  清理后累计：收入 $($final.total.incomeFen) 分 / 开销 $($final.total.expenseFen) 分 / 余额 $($final.total.balanceFen) 分"

Write-Host ""
if ($failed -eq 0) {
  Write-Host "全部检查通过 ✅" -ForegroundColor Green
} else {
  Write-Host "有 $failed 项检查未通过 ❌" -ForegroundColor Red
  exit 1
}
