import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const entryFile = path.join(rootDir, "src", "main.js");
const headerFile = path.join(rootDir, "scripts", "userscript-header.template.js");
const outputFile = path.join(rootDir, "dist", "bilibili_blocked_videos_by_tags.user.js");

const importRegex = /^\s*import\s+[^;]+from\s+["'](.+?)["'];\s*$/gm;
const importLineRegex = /^\s*import\s+[^;]+;\s*$/gm;
const exportKeywordRegex = /^\s*export\s+/gm;

const seenFiles = new Set();
const chunks = [];

await collectModule(entryFile);

const header = (await readFile(headerFile, "utf8")).trimEnd();
const body = chunks.join("\n\n");
const output = `${header}

(function () {
"use strict";

${body}
})();
`;

await mkdir(path.dirname(outputFile), { recursive: true });
await writeFile(outputFile, output, "utf8");

console.log(`Built ${path.relative(rootDir, outputFile)}`);

async function collectModule(filePath) {
    const normalizedPath = path.normalize(filePath);
    if (seenFiles.has(normalizedPath)) {
        return;
    }
    seenFiles.add(normalizedPath);

    const source = await readFile(normalizedPath, "utf8");
    const imports = [...source.matchAll(importRegex)].map((match) => match[1]);

    for (const importPath of imports) {
        if (!importPath.startsWith(".")) {
            throw new Error(`Only relative imports are supported: ${importPath}`);
        }

        const dependencyPath = path.resolve(path.dirname(normalizedPath), importPath);
        await collectModule(dependencyPath);
    }

    const transformedSource = source
        .replace(importLineRegex, "")
        .replace(exportKeywordRegex, "")
        .trim();

    chunks.push(`// ---- ${path.relative(rootDir, normalizedPath).replaceAll("\\", "/")} ----\n${transformedSource}`);
}

