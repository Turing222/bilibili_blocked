import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { diffInspectResults } from "./normalize-results.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function collectArgs() {
  const passthrough = [];
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === "--out-dir") {
      i += 1;
      continue;
    }
    passthrough.push(arg);
  }
  return passthrough;
}

function runNode(scriptName, args, { capture = true } = {}) {
  const scriptPath = path.join(__dirname, scriptName);
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: "utf8",
    env: process.env,
    timeout: 600_000,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${scriptName} failed`);
  }

  return capture ? result.stdout.trim() : undefined;
}

function hasArg(args, name) {
  return args.includes(name);
}

export function buildMcpArgs(oracleArgs, oracle) {
  if (!hasArg(oracleArgs, "--open-first-video") || hasArg(oracleArgs, "--video")) {
    return [...oracleArgs];
  }

  const oracleUrl = oracle?.state?.url;
  if (typeof oracleUrl === "string" && oracleUrl.includes("bilibili.com/video/")) {
    return [...oracleArgs, "--video", oracleUrl];
  }

  return [...oracleArgs];
}

async function main() {
  const outDirArg = readArg("--out-dir");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = outDirArg
    ? path.resolve(outDirArg)
    : path.join(process.cwd(), "artifacts", "mcp-oracle", timestamp);

  await fs.mkdir(outDir, { recursive: true });

  const passthrough = collectArgs();
  console.error(`Collecting oracle via inspect-comments.mjs ...`);
  const oracleRaw = runNode("inspect-comments.mjs", passthrough);
  const oracle = JSON.parse(oracleRaw);
  await fs.writeFile(path.join(outDir, "oracle.json"), `${JSON.stringify(oracle, null, 2)}\n`, "utf8");

  const mcpArgs = buildMcpArgs(passthrough, oracle);
  console.error(`Collecting MCP probe via mcp-probe-collect.mjs ...`);
  const mcpRaw = runNode("mcp-probe-collect.mjs", mcpArgs);
  const mcp = JSON.parse(mcpRaw);
  await fs.writeFile(path.join(outDir, "mcp.json"), `${JSON.stringify(mcp, null, 2)}\n`, "utf8");

  const diffs = diffInspectResults(oracle, mcp);
  const report = {
    ok: diffs.length === 0,
    outDir,
    args: passthrough,
    mcpArgs,
    diffs,
  };
  await fs.writeFile(path.join(outDir, "diff-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) {
    process.exit(1);
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
