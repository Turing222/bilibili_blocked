import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const paths = {
    header: path.join(rootDir, "scripts", "userscript-header.template.js"),
    dist: path.join(rootDir, "dist", "bilibili_blocked_videos_by_tags.user.js"),
    changelog: path.join(rootDir, "CHANGELOG.md"),
};

const args = parseArgs(process.argv.slice(2));
const expectedVersion = args.version || null;
const expectedTag = args.tag || process.env.GITHUB_REF_NAME || null;

const failures = [];

const header = await readText(paths.header);
const dist = await readText(paths.dist);
const changelog = await readText(paths.changelog);

const headerVersion = readUserscriptVersion(header, paths.header);
const distVersion = readUserscriptVersion(dist, paths.dist);
const version = expectedVersion || headerVersion;
const releaseDocPath = path.join(rootDir, "docs", "releases", `v${version}.md`);

check(headerVersion === version, `header @version is ${headerVersion}, expected ${version}`);
check(distVersion === version, `dist @version is ${distVersion}, expected ${version}. Run npm run build after bumping the header.`);
check(changelogHasVersion(changelog, version), `CHANGELOG.md is missing a v${version} section`);
await checkFileExists(releaseDocPath, `missing docs/releases/v${version}.md`);

if (expectedTag) {
    check(expectedTag === `v${version}`, `tag is ${expectedTag}, expected v${version}`);
}

if (failures.length > 0) {
    console.error("Release check failed:");
    for (const failure of failures) {
        console.error(`- ${failure}`);
    }
    process.exit(1);
}

console.log(`Release check passed for v${version}`);

function parseArgs(values) {
    const result = {};
    for (let i = 0; i < values.length; i += 1) {
        const value = values[i];
        if (value === "--version") {
            result.version = values[i + 1];
            i += 1;
            continue;
        }
        if (value?.startsWith("--version=")) {
            result.version = value.slice("--version=".length);
            continue;
        }
        if (value === "--tag") {
            result.tag = values[i + 1];
            i += 1;
            continue;
        }
        if (value?.startsWith("--tag=")) {
            result.tag = value.slice("--tag=".length);
        }
    }
    return result;
}

async function readText(filePath) {
    try {
        return await readFile(filePath, "utf8");
    } catch (error) {
        failures.push(`cannot read ${path.relative(rootDir, filePath)}: ${error.message}`);
        return "";
    }
}

function readUserscriptVersion(text, filePath) {
    const match = text.match(/^\/\/ @version\s+(\S+)/m);
    if (!match) {
        failures.push(`cannot find @version in ${path.relative(rootDir, filePath)}`);
        return "";
    }
    return match[1];
}

function changelogHasVersion(text, version) {
    const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`^##\\s+v${escapedVersion}\\b`, "m").test(text);
}

async function checkFileExists(filePath, message) {
    try {
        await access(filePath);
    } catch {
        failures.push(message);
    }
}

function check(condition, message) {
    if (!condition) {
        failures.push(message);
    }
}
