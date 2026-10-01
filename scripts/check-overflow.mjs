// 开发期检查：用 Chrome DevTools Protocol 测量页面横向溢出与关键尺寸
// 用法： node scripts/check-overflow.mjs [base] [width] [path]
import { spawn } from "node:child_process";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const base = process.argv[2] ?? "http://127.0.0.1:3178";
const width = Number(process.argv[3] ?? 390);
const targetPath = process.argv[4] ?? "/";

const candidates = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const chromePath = candidates.find((p) => existsSync(p));
if (!chromePath) throw new Error("找不到 Chrome/Edge");

const port = 9333;
const profile = mkdtempSync(path.join(tmpdir(), "dsh-cdp-"));
const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    `--window-size=${width},900`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  const res = await fetch(url);
  return res.json();
}

let ws;
try {
  let target = null;
  for (let i = 0; i < 40 && !target; i += 1) {
    await sleep(250);
    try {
      const list = await getJson(`http://127.0.0.1:${port}/json/list`);
      target = list.find((t) => t.type === "page");
    } catch {
      /* 还没起来 */
    }
  }
  if (!target) throw new Error("Chrome 调试端口未就绪");

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      id += 1;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });

  await send("Page.enable");
  await send("Runtime.enable");
  // 用设备指标覆盖精确设定视口宽度，保证移动端布局被真正触发
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height: 900,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await send("Page.navigate", { url: `${base}${targetPath}` });
  await sleep(3500);

  const expression = `(() => {
    const vw = document.documentElement.clientWidth;
    const offenders = [];
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const over = Math.round(r.right - vw);
      if (over > 1) {
        offenders.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className || "").toString().slice(0, 90),
          text: (el.textContent || "").trim().slice(0, 30),
          right: Math.round(r.right),
          over,
        });
      }
    }
    offenders.sort((a, b) => b.over - a.over);
    return JSON.stringify({
      viewport: vw,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      offenders: offenders.slice(0, 12),
    });
  })()`;

  const result = await send("Runtime.evaluate", { expression, returnByValue: true });
  const value = result.result?.result?.value;
  console.log(`== ${targetPath} @ ${width}px ==`);
  console.log(value);
} finally {
  try {
    ws?.close();
  } catch {
    /* ignore */
  }
  chrome.kill();
}
