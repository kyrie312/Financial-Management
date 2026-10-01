// 开发期交互检查：用 CDP 模拟点击，走一遍「记一笔开销」流程并截图
// 用法： node scripts/check-form-flow.mjs
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const base = process.env.SMOKE_BASE ?? "http://127.0.0.1:3178";
const outDir = "E:\\DSH\\DSH_Project\\花费明细\\screenshots";

const chromePath = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].find((p) => existsSync(p));
const port = 9336;
const profile = mkdtempSync(path.join(tmpdir(), "dsh-flow-"));
const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
try {
  let target = null;
  for (let i = 0; i < 40 && !target; i += 1) {
    await sleep(250);
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find((t) => t.type === "page");
    } catch {
      /* not ready */
    }
  }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
  };
  const send = (method, params = {}) =>
    new Promise((res) => {
      id += 1;
      pending.set(id, res);
      ws.send(JSON.stringify({ id, method, params }));
    });

  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    return r.result?.result?.value;
  };
  const shot = async (name) => {
    const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    const file = path.join(outDir, `${name}.png`);
    writeFileSync(file, Buffer.from(r.result.data, "base64"));
    console.log("saved", name);
  };

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await send("Page.navigate", { url: `${base}/` });
  await sleep(3000);

  // 点「－ 开销」
  console.log("step1:", await evaluate(`(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => b.textContent.includes("开销"));
    if (!btn) return "button not found";
    btn.click();
    return "clicked expense";
  })()`));
  await sleep(1200);
  await shot("flow-1-choose-category");

  // 选「生活费」
  console.log("step2:", await evaluate(`(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => b.textContent.includes("生活费"));
    if (!btn) return "not found";
    btn.click();
    return "clicked life";
  })()`));
  await sleep(1000);
  await shot("flow-2-choose-subcategory");

  // 选「吃饭」
  console.log("step3:", await evaluate(`(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "吃饭");
    if (!btn) return "not found";
    btn.click();
    return "clicked 吃饭";
  })()`));
  await sleep(1000);
  await shot("flow-3-amount");

  // 输入金额（React 受控输入需要派发 input 事件）
  console.log("step4:", await evaluate(`(() => {
    const input = document.querySelector("#amount");
    if (!input) return "amount input not found";
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, "26.50");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return "typed " + input.value;
  })()`));
  await sleep(600);
  await shot("flow-4-filled");

  // 点确认提交
  console.log("step5:", await evaluate(`(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => b.textContent.includes("确认提交"));
    if (!btn) return "submit not found";
    btn.click();
    return "submitted";
  })()`));
  await sleep(3000);
  await shot("flow-5-after-submit");
  console.log(
    "page now:",
    await evaluate(`(() => {
      const text = document.body.innerText;
      const idx = text.indexOf("当前可支配总额");
      return text.slice(idx, idx + 120).replace(/\\n/g, " | ");
    })()`),
  );
} finally {
  try {
    ws?.close();
  } catch {
    /* ignore */
  }
  chrome.kill();
}
