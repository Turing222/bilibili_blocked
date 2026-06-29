import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const baselineRoot = path.resolve("artifacts/playwright/baselines");
const videoUrl = "https://www.bilibili.com/video/BV1Vk7M6tEgx/";

async function copyLatestRun(sourceRoot, targetName) {
  const entries = await fs.readdir(sourceRoot, { withFileTypes: true });
  const runs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const latest = runs.at(-1);
  if (!latest) {
    throw new Error(`No runs found under ${sourceRoot}`);
  }

  const sourceDir = path.join(sourceRoot, latest);
  const targetDir = path.join(baselineRoot, targetName);
  await fs.mkdir(targetDir, { recursive: true });

  for (const fileName of ["result.json", "events.jsonl"]) {
    await fs.copyFile(path.join(sourceDir, fileName), path.join(targetDir, fileName));
  }

  return { sourceDir, targetDir };
}

function runSmoke(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    stdio: "inherit",
    timeout: 600_000,
  });
  if (result.status !== 0) {
    throw new Error(`${script} failed with exit code ${result.status ?? "unknown"}`);
  }
}

async function main() {
  await fs.mkdir(baselineRoot, { recursive: true });

  runSmoke("scripts/comment-timing-smoke.mjs", ["--video", videoUrl]);
  const comment = await copyLatestRun("artifacts/playwright/comment-timing", "comment-timing");

  runSmoke("scripts/video-card-timing-smoke.mjs");
  const videoCard = await copyLatestRun("artifacts/playwright/video-card-timing", "video-card-timing");

  console.log(
    JSON.stringify(
      {
        ok: true,
        baselineRoot,
        commentTiming: comment,
        videoCardTiming: videoCard,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
