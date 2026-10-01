/**
 * 一键启动本地服务（供「启动网站.bat」调用）。
 * 作用：启动 Next.js 开发服务器 -> 端口就绪后自动打开浏览器 -> 持续运行直到 Ctrl+C。
 * 说明：因为要用 NetBIOS 之外的纯 JS 打开浏览器，这里用 child_process.spawn + stdio inherit，
 * 服务日志会直接显示在当前控制台窗口里。
 */
import { spawn, execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT ?? 3178);
const nextBin = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");
const url = `http://localhost:${port}`;

const line = "=".repeat(52);
console.log(line);
console.log("  生活开销记账 —— 正在启动本地服务");
console.log(line);
console.log("");

if (!existsSync(nextBin)) {
  console.error("找不到 Next.js，请先在项目目录执行一次： npm install");
  process.exit(1);
}

/** 服务就绪后自动打开默认浏览器（Windows 用 start，其他系统用 open/xdg-open） */
function openBrowser() {
  // 调试/测试时可以设 NO_BROWSER=1 跳过自动打开
  if (process.env.NO_BROWSER === "1") {
    console.log(`（已跳过自动打开浏览器，请手动访问：${url}）`);
    return;
  }
  try {
    if (process.platform === "win32") {
      // cmd /c start "" "url" —— 第一个空参数是窗口标题
      execFile("cmd", ["/c", "start", '""', url], { windowsHide: true });
    } else if (process.platform === "darwin") {
      execFile("open", [url]);
    } else {
      execFile("xdg-open", [url]);
    }
    console.log(`已尝试自动打开浏览器：${url}`);
  } catch {
    console.log(`没能自动打开浏览器，请手动访问：${url}`);
  }
}

const childEnv = { ...process.env };
// 只在支持彩色的终端里开颜色，避免与 NO_COLOR 冲突产生警告
if (process.stdout.isTTY && !childEnv.NO_COLOR) childEnv.FORCE_COLOR = "1";

const child = spawn(process.execPath, [nextBin, "dev", "--port", String(port)], {
  cwd: projectRoot,
  stdio: "inherit",
  env: childEnv,
});

let opened = false;

/** 轮询端口，就绪后打开浏览器（最多等 60 秒） */
async function waitForServer() {
  for (let i = 0; i < 120 && !opened; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status > 0) {
        opened = true;
        console.log("");
        console.log(line);
        console.log(`  服务已就绪：${url}`);
        console.log("  局域网内其他设备可用：http://本机IP:" + port);
        console.log("");
        console.log("  【重要】这个窗口不要关闭，关掉就等于停止网站。");
        console.log("  用完按 Ctrl + C，或直接关闭本窗口。");
        console.log(line);
        console.log("");
        openBrowser();
        return;
      }
    } catch {
      /* 还没起来，继续等 */
    }
  }
  if (!opened) {
    console.log("");
    console.log("服务启动超时。请把上面窗口里的报错信息发给开发者，或手动访问 " + url);
  }
}

const watcher = waitForServer();

child.on("exit", (code) => {
  console.log("");
  console.log(`服务已停止（退出码 ${code ?? 0}）。数据保存在 data\\ledger.db，不会丢失。`);
  process.exit(code ?? 0);
});

process.on("SIGINT", () => {
  child.kill("SIGINT");
});

await watcher;
