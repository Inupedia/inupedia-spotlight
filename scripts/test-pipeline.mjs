#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const stages = [
  { name: "build", cmd: "pnpm", args: ["run", "build"] },
  { name: "smoke", cmd: "pnpm", args: ["run", "smoke:packages"] },
  { name: "typecheck", cmd: "pnpm", args: ["run", "typecheck"] },
  { name: "unit", cmd: "pnpm", args: ["run", "test:run"] },
];

function runStage(stage) {
  return new Promise((resolve, reject) => {
    console.log(
      `\n${"=".repeat(60)}\n▶ stage: ${stage.name}\n${"=".repeat(60)}\n`,
    );
    const started = Date.now();
    const child = spawn(stage.cmd, stage.args, {
      cwd: rootDir,
      stdio: "inherit",
      shell: true,
      env: process.env,
    });
    child.on("exit", (code) => {
      const sec = ((Date.now() - started) / 1000).toFixed(1);
      if (code === 0) {
        console.log(`\n✓ stage "${stage.name}" passed (${sec}s)\n`);
        resolve();
      } else {
        reject(new Error(`stage "${stage.name}" failed (exit ${code})`));
      }
    });
  });
}

for (const stage of stages) {
  await runStage(stage);
}

console.log(`\n${"=".repeat(60)}\n✓ ALL STAGES PASSED\n${"=".repeat(60)}\n`);
