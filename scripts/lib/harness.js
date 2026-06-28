// == 浏览器冒烟脚本公共骨架 ====================================================
//
// 这个模块抽取了 scripts/*-smoke.mjs 三个脚本里逐字重复的工具函数,统一为
// 一份可复用的“命令转测试”骨架。新增浏览器冒烟脚本时优先从这里 import,
// 不要再各自复制一遍。
//
// 设计约定:
// - 纯工具,不连接浏览器、不读项目业务模块。只依赖 node:fs / node:path。
// - 产物格式统一:每次运行落 result.json(结论)+ events.jsonl(事件流)。
// - 事件用 recorder.mark(kind, data) 记录,kind 走 "run.start" / "browser.connected"
//   / "xxx.sample" / "run.end" 这类点分命名约定。
//
// 不属于这里的内容:被测脚本的注入逻辑、页面 DOM 选择器、UI 交互判定——这些
// 绑定具体项目,留在各自的 smoke 脚本里。

import fs from "node:fs/promises";
import path from "node:path";

// 从命令行参数读取 `--name value` 形式的值。argv 可注入,便于单测。
export function readArg(name, argv = process.argv) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

// 折叠空白并截断,用于把页面文本塞进 result.json 时保持紧凑。
export function cleanText(value, max = 240) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

// 基于时间戳生成可作目录名的运行 ID(冒号和点都换成连字符)。
export function createRunId() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

// 事件记录器:每条事件带相对毫秒 t、ISO 时间戳 ts、kind 和任意数据。
export function createRecorder() {
  const startedAt = Date.now();
  const events = [];
  return {
    events,
    mark(kind, data = {}) {
      events.push({
        t: Date.now() - startedAt,
        ts: new Date().toISOString(),
        kind,
        ...data,
      });
    },
  };
}

// 把绝对路径转成相对当前工作目录的展示路径。
export function toRelative(filePath) {
  return path.relative(process.cwd(), filePath) || ".";
}

// 把一次运行的结论和事件流写到 runDir 下的 result.json / events.jsonl。
export async function writeRunFiles(runDir, result, events) {
  const resultPath = path.join(runDir, "result.json");
  const eventsPath = path.join(runDir, "events.jsonl");
  await fs.writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  await fs.writeFile(eventsPath, `${events.map((event) => JSON.stringify(event)).join("\n")}\n`, "utf8");
  return { resultPath, eventsPath };
}

// 在已连接的 CDP context 里挑目标标签页。
// prefer 是一组 URL 子串,按顺序优先匹配;都不中则退回首个页面,没有则新开。
export async function selectPage(context, prefer = []) {
  const pages = context.pages();
  for (const needle of prefer) {
    const match = pages.find((page) => page.url().includes(needle));
    if (match) {
      return match;
    }
  }
  return pages[0] ?? (await context.newPage());
}
