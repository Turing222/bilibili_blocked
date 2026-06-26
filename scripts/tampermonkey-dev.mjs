import { createServer } from "node:http";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const buildScript = path.join(rootDir, "scripts", "build-userjs.mjs");
const headerFile = path.join(rootDir, "scripts", "userscript-header.template.js");
const bodyFileName = "bilibili_blocked.dev.body.js";
const devUserFileName = "bilibili_blocked.dev.user.js";
const bodyFile = path.join(distDir, bodyFileName);
const devUserFile = path.join(distDir, devUserFileName);
const startChromeScript = path.join(rootDir, "tools", "bilibili-browser", "start-chrome.ps1");

const options = readOptions(process.argv.slice(2));

if (options.help) {
    printHelp();
    process.exit(0);
}

const stamp = createVersionStamp();
const baseUrl = `http://${options.host}:${options.port}`;
const bodyUrl = `${baseUrl}/${bodyFileName}?v=${stamp}`;
const installUrl = `${baseUrl}/${devUserFileName}`;

await runBuildRequire();
await writeDevUserscript({ bodyUrl, installUrl, stamp });

if (options.buildOnly) {
    console.log(`Built ${path.relative(rootDir, bodyFile)}`);
    console.log(`Built ${path.relative(rootDir, devUserFile)}`);
    console.log(`Install URL: ${installUrl}`);
    process.exit(0);
}

const server = await startServer({
    host: options.host,
    port: options.port,
});

console.log(`Serving Tampermonkey dev files from ${path.relative(rootDir, distDir)}`);
console.log(`Install or update URL: ${installUrl}`);
console.log(`Body URL: ${bodyUrl}`);

if (!options.noOpen) {
    await openInstallUrl(installUrl, options.chromePort);
}

console.log("Keep this process running while Tampermonkey installs or updates the script.");
console.log("Press Ctrl+C to stop the local dev server.");

process.on("SIGINT", () => {
    server.close(() => process.exit(0));
});

function readOptions(args) {
    const result = {
        host: "127.0.0.1",
        port: 8741,
        chromePort: 9223,
        buildOnly: false,
        noOpen: false,
        help: false,
    };

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === "--help" || arg === "-h") {
            result.help = true;
        } else if (arg === "--build-only") {
            result.buildOnly = true;
        } else if (arg === "--no-open") {
            result.noOpen = true;
        } else if (arg === "--host") {
            result.host = requireValue(args, ++index, arg);
        } else if (arg === "--port") {
            result.port = readPositiveInteger(requireValue(args, ++index, arg), arg);
        } else if (arg === "--chrome-port") {
            result.chromePort = readPositiveInteger(requireValue(args, ++index, arg), arg);
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    return result;
}

function requireValue(args, index, flag) {
    const value = args[index];
    if (!value || value.startsWith("--")) {
        throw new Error(`${flag} requires a value.`);
    }
    return value;
}

function readPositiveInteger(value, flag) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
        throw new Error(`${flag} must be a TCP port number.`);
    }
    return parsed;
}

function createVersionStamp() {
    const now = new Date();
    const parts = [
        now.getFullYear(),
        now.getMonth() + 1,
        now.getDate(),
        now.getHours(),
        now.getMinutes(),
        now.getSeconds(),
    ].map((part) => String(part).padStart(2, "0"));
    return parts.join("");
}

function printHelp() {
    console.log(`Usage: node scripts/tampermonkey-dev.mjs [options]

Builds the @require body, writes a dev userscript loader, serves dist locally,
and opens the loader in the dedicated Bilibili Chrome profile.

Options:
  --port <port>          Local HTTP server port. Default: 8741
  --host <host>          Local HTTP host. Default: 127.0.0.1
  --chrome-port <port>   Existing Chrome DevTools port. Default: 9223
  --build-only           Build body and dev loader, then exit
  --no-open              Do not open Chrome
  -h, --help             Show this help
`);
}

async function runBuildRequire() {
    await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [buildScript, "--require"], {
            cwd: rootDir,
            stdio: "inherit",
        });
        child.on("error", reject);
        child.on("exit", (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`build-userjs exited with code ${code}`));
            }
        });
    });
}

async function writeDevUserscript({ bodyUrl, installUrl, stamp }) {
    const header = (await readFile(headerFile, "utf8")).trimEnd();
    const devVersion = `2.0.0.${stamp}`;
    const lines = header.split(/\r?\n/);
    const output = [];
    let insertedDevLines = false;

    for (const line of lines) {
        if (/^\/\/ @version\s+/.test(line)) {
            output.push(`// @version         ${devVersion}`);
            continue;
        }
        if (/^\/\/ @description\s+/.test(line)) {
            output.push("// @description     Local dev loader for Bilibili Blocked.");
            continue;
        }
        if (line === "// ==/UserScript==") {
            output.push(`// @require         ${bodyUrl}`);
            output.push(`// @updateURL       ${installUrl}`);
            output.push(`// @downloadURL     ${installUrl}`);
            insertedDevLines = true;
        }
        output.push(line);
    }

    if (!insertedDevLines) {
        throw new Error("Could not find userscript metadata footer.");
    }

    output.push("");
    output.push("/* Development loader: the executable body is loaded through @require. */");
    output.push("");

    await writeFile(devUserFile, `${output.join("\n")}`, "utf8");
}

async function startServer({ host, port }) {
    const server = createServer(async (request, response) => {
        try {
            await handleRequest(request, response);
        } catch (error) {
            response.writeHead(500, {
                "Content-Type": "text/plain; charset=utf-8",
                "Cache-Control": "no-store",
            });
            response.end(`${error.stack || error.message}\n`);
        }
    });

    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
            server.off("error", reject);
            resolve();
        });
    });

    return server;
}

async function handleRequest(request, response) {
    const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
    const pathname = decodeURIComponent(requestUrl.pathname);
    const route = pathname.replace(/^\/+/, "");
    const allowedFiles = new Set([
        bodyFileName,
        devUserFileName,
        "bilibili_blocked_videos_by_tags.user.js",
    ]);

    if (!allowedFiles.has(route)) {
        response.writeHead(404, {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
        });
        response.end("Not found\n");
        return;
    }

    const filePath = path.resolve(distDir, route);
    if (!filePath.startsWith(`${distDir}${path.sep}`)) {
        response.writeHead(403, {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
        });
        response.end("Forbidden\n");
        return;
    }

    await stat(filePath);
    const content = await readFile(filePath);
    response.writeHead(200, {
        "Content-Type": "application/javascript; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
    });
    response.end(content);
}

async function openInstallUrl(url, chromePort) {
    if (await openViaCdp(url, chromePort)) {
        console.log(`Opened install URL through Chrome DevTools on port ${chromePort}.`);
        return;
    }

    await new Promise((resolve, reject) => {
        const child = spawn("powershell.exe", [
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            startChromeScript,
            "-Port",
            String(chromePort),
            "-Url",
            url,
            "-OpenUrlWhenRunning",
        ], {
            cwd: rootDir,
            stdio: "inherit",
        });
        child.on("error", reject);
        child.on("exit", (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`start-chrome exited with code ${code}`));
            }
        });
    });
}

async function openViaCdp(url, chromePort) {
    try {
        const endpoint = `http://127.0.0.1:${chromePort}/json/new?${encodeURIComponent(url)}`;
        const response = await fetch(endpoint, { method: "PUT" });
        return response.ok;
    } catch {
        return false;
    }
}
