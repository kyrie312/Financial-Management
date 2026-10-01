# 生活开销记账

记录收入与花销的小工具。数据存在本机项目目录里，界面可以在两台电脑（家里 / 公司）分别打开同一份数据。

> 需求原文见 [记录生活开销.md](./记录生活开销.md)。本文件说明怎么用、怎么在两台电脑上同步。

## 一、功能一览

**主页**
- 三张板块卡片：生活费 / 副业 / 学校补助，显示**累计余额**（收入 − 开销，负数红色警示）
- 顶部显示**总资产** = 三个板块余额之和，并同时显示累计收入/开销与本月收入/开销
- 卡片角标显示**本月变化**；点击卡片进入该板块详情
- 底部两个大按钮：**＋收入**、**－开销**
- 顶栏：导出 CSV、设置、退出登录

**记一笔**
- 收入：选板块 → 输金额（两位小数）→ 副业和学校补助**必须填来源备注**，为空无法提交
- 开销：选板块 →（生活费需再选 7 个细分之一）→ 输金额（副业/学校补助必须填用途备注）
- 时间自动取**录入时的本机时间**，不需要手填
- 每一步都能「← 返回上一步」重新选类型

**生活费详情页**
- 总收入、总开销、余额（累计与所选区间各一套）
- 7 个细分类型（吃饭/交通/网购/住宿/礼物/会员/生活）各自总额与占比 + **环形（扇形）图**
- 按原文要求：这里只看汇总，不列逐笔明细
- **汇总数值可以直接改**：点「区间收入」或任一细分类型卡片上的 **✏️ 修改**，可以
  - **按金额增减**：例如「吃饭 加 50」「吃饭 减 50」
  - **直接改成**：例如「吃饭 改成 600」「改成 0」表示清零
  修改只作用于当前选中的区间（累计或某个月），改完汇总、占比、环形图、余额立即重算。
  （后台会把这个区间内该类目的旧记录替换成一条调整记录，所以账目始终自洽；因为生活费页本来就不列逐笔明细，操作上就是"改汇总数字"。）

**副业 / 学校补助详情页**
- 总收入、总开销、余额（累计与所选区间各一套）
- **收入明细**与**开销明细分开展示**，各显示备注与时间，按时间从新到旧，每页 10 条可翻页
- 每笔记录都能**编辑**（改金额 / 改备注 / 改板块 / 改细分类型）或**删除**；改完所有统计、图表、余额立即重算

**其他**
- 单账号密码登录，登录状态保持 30 天
- 导出全部记录为 CSV（Excel 可直接打开，带 BOM 不乱码）
- 手机浏览器可用，「添加到主屏幕」后像 APP 一样全屏使用

## 二、怎么用

### 平时使用：直接打开云端网址（推荐）

**https://financial-management-snowy.vercel.app**

- 两台电脑、手机都打开这个网址即可，**数据只有一份在云端，改完刷新就能看到，不存在同步问题**
- 手机上可以「添加到主屏幕」，用起来和 APP 一样
- 账号：`admin`，密码是部署时在 Vercel 填的 `APP_PASSWORD`（要改密码就到网站里的「设置」）

### 本地开发（可选，需要联网）

本机跑开发服务器时，也是连**同一个云端数据库**（通过 `.env.local` 里的 `DATABASE_URL`）：

```powershell
npm install      # 只需第一次执行
npm run dev      # 打开 http://localhost:3178
# 或者双击「启动网站.bat」
```

> 断网时本机只能看、不能写；日常使用建议直接用上面的云端网址。

### 配置项（本机 `.env.local` / 线上 Vercel 环境变量）

```
DATABASE_URL=postgresql://...        # Supabase 连接池连接串（必须）
SESSION_SECRET=一串随机字符            # 登录状态签名密钥，换掉会让所有设备需要重新登录
APP_PASSWORD=你的登录密码              # 首次初始化账号时使用
```

## 三、部署与数据（Supabase + Vercel）

- 代码仓库：`https://github.com/kyrie312/Financial-Management`
- 线上网址：`https://financial-management-snowy.vercel.app`
- 数据库：Supabase Postgres（美国西部 us-west-2）
- 详细部署步骤、环境变量、迁移脚本见 **[docs/云端部署.md](docs/云端部署.md)**

### 把本机数据搬到云端

```powershell
node scripts/migrate-to-supabase.mjs          # 追加导入（自动去重）
node scripts/migrate-to-supabase.mjs --reset  # 清空云端记录后完整导入
node scripts/setup-cloud-user.mjs             # 在云端创建登录账号（幂等）
```

### 备选：完全本地运行（不联网）

项目也保留了「本机 SQLite」的完整备份数据（`data\ledger.db`）与相关脚本，
如果你以后想改成纯本地运行，把 `src/lib/db.ts` 换回 SQLite 版本即可（历史提交里有）。
本地那份数据的操作方式：`停止网站.bat` 会把 WAL 日志合并进 `ledger.db`，
合并后 `ledger.db` 是可以单独复制走的完整单文件。

## 四、早期「手工同步文件」方案（已不需要，留作参考）

现在用云端网址，两台电脑没有同步问题，下面这些只在你想完全本地运行时才有意义。

**要点（踩过的坑）**：本机数据库是 SQLite 的 WAL 模式，刚写入的数据可能还在 ledger.db-wal 里。
- 单独复制 ledger.db（网站还在运行）→ **会丢数据**（实测：17 条 vs 19 条）
- 正确做法：先双击 停止网站.bat（它会自动执行 checkpoint，把日志合并回主文件），
  等到窗口显示 ledger.db-wal ... -> 0.0 KB，再复制 ledger.db
- 判断依据是 **ledger.db-wal 是否为 0**，不要只看 ledger.db 的大小
- 
ode_modules 与 .next **不要跨电脑拷贝**（里面有指向绝对路径的符号链接），新机器执行一次 
pm install 即可（实测 1 分钟、328 个包）

## 五、自测与开发脚本

```powershell
# 接口自测（开发服务器需正在运行）：真实写入测试记录并逐项校验，结束时自动清理
powershell -File scripts/smoke-test.ps1

# 生活费「改总额」功能自测：会先备份本月的同类记录，测完自动还原
powershell -File scripts/smoke-life-adjust.ps1

# 写入一批演示数据（幂等，可重复执行；全部备注带 [demo] 前缀）
powershell -File scripts/seed-demo.ps1
powershell -File scripts/seed-demo.ps1 -Clean   # 清掉演示数据

# 页面截图（无头 Chrome，输出到 screenshots/）
powershell -File scripts/screenshot.ps1

# 测量窄屏是否横向溢出（输出溢出元素，无溢出则 offenders 为空）
node scripts/check-overflow.mjs http://127.0.0.1:3178 390 /life

# 模拟点击走一遍记账流程并截图
node scripts/check-form-flow.mjs
```

> ⚠️ 开发服务器（`npm run dev`）为了本机调试方便，对**来自本机回环地址**的请求会跳过登录校验
> （见 `src/lib/dev-preview.ts`）。所以**不要把 dev 服务器暴露到公网**。
> 生产模式 `npm run build && npm start` 没有这个旁路，登录保护是完整生效的。

## 六、技术栈与目录

- Next.js 15（App Router）+ React 19 + TypeScript + Tailwind CSS 4
- 数据库：Node 内置 `node:sqlite`（零额外依赖，数据文件在本机）
- 登录：PBKDF2 密码哈希 + HMAC 签名的会话 Cookie

```
src/
  app/
    page.tsx                   主页
    life|side|school/page.tsx  三个板块详情页
    settings/page.tsx          设置（改密码、导出）
    login/page.tsx             登录
    api/                       接口：auth / summary / records
  components/                  界面组件（弹窗、环形图、明细列表…）
  lib/                         数据层、鉴权、金额与时间工具
scripts/smoke-test.ps1         接口自测
data/ledger.db                 账本数据（首次启动自动创建，已被 .gitignore 排除）
```

## 七、已知边界

- 金额一律以「分」为整数存储，避免浮点误差。
- 明细每页固定 10 条（要改的话改 `src/lib/ledger.ts` 里默认 `pageSize`）。
- 类别目前固定为 3 个来源 + 生活费 7 个细分；数据库已按「类别表 + 记录表」设计，日后加自定义类别不需要改表结构。
