#!/usr/bin/env node

import { checkbox, confirm, select } from "@inquirer/prompts";
import { readFileSync } from "fs";
import { execSync } from "child_process";
import { join, resolve } from "path";
import { detectManagers } from "./detector";
import { parsePackageLock } from "./lockfile-parsers/package-lock";
import { parseYarnLock } from "./lockfile-parsers/yarn-lock";
import { parseBunLock } from "./lockfile-parsers/bun-lock";
import { parseComposerLock } from "./lockfile-parsers/composer-lock";
import { computePinChanges, applyPinChanges } from "./pinner";
import { updateNpmrc } from "./npmrc";
import type { JsPackageManager, PinChange } from "./types";

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

interface ManagerChanges {
  manager: string;
  changes: PinChange[];
  skipped: number;
  alreadyPinned: number;
}

function getInstallCommand(manager: JsPackageManager): string {
  const commands: Record<JsPackageManager, string> = {
    npm: "npm install",
    yarn: "yarn install",
    bun: "bun install",
  };
  return commands[manager];
}

function getLockFileName(manager: JsPackageManager): string {
  const files: Record<JsPackageManager, string> = {
    npm: "package-lock.json",
    yarn: "yarn.lock",
    bun: "bun.lock",
  };
  return files[manager];
}

function parseLockFile(
  manager: JsPackageManager,
  content: string,
): Map<string, string> {
  const parsers: Record<JsPackageManager, (c: string) => Map<string, string>> =
    {
      npm: parsePackageLock,
      yarn: parseYarnLock,
      bun: parseBunLock,
    };
  return parsers[manager](content);
}

async function main(): Promise<void> {
  const dir = resolve(".");

  console.log(bold("\ndep-locker\n"));

  // Step 1: Detection
  const detection = detectManagers(dir);

  if (!detection.hasPackageJson && !detection.hasComposerJson) {
    console.error(
      red(
        "No package.json or composer.json found. Run this from your project root.",
      ),
    );
    process.exit(1);
  }

  // Determine JS manager
  let jsManager: JsPackageManager | null = null;
  let jsLockFilePath: string | null = null;

  if (detection.hasPackageJson) {
    if (detection.jsLockFiles.length === 1) {
      jsManager = detection.jsLockFiles[0].type;
      jsLockFilePath = detection.jsLockFiles[0].path;
      console.log(`Detected ${bold(jsManager)} ${dim("(from lock file)")}`);
    } else if (detection.jsLockFiles.length > 1) {
      jsManager = await select({
        message:
          "Multiple lock files found. Which package manager do you use?",
        choices: detection.jsLockFiles.map((lf) => ({
          name: lf.type,
          value: lf.type,
        })),
      });
      jsLockFilePath = detection.jsLockFiles.find(
        (lf) => lf.type === jsManager,
      )!.path;
    } else {
      jsManager = await select({
        message: "No lock file found. Which package manager do you use?",
        choices: [
          { name: "npm", value: "npm" as const },
          { name: "yarn", value: "yarn" as const },
          { name: "bun", value: "bun" as const },
        ],
      });
    }
  }

  if (detection.hasComposerJson) {
    console.log(`Detected ${bold("composer")}`);
  }

  // Step 2: Generate missing lock files
  if (jsManager && !jsLockFilePath) {
    const installCmd = getInstallCommand(jsManager);
    console.log(
      yellow(`\nNo lock file found. Running ${installCmd} to generate it...`),
    );
    try {
      execSync(installCmd, { cwd: dir, stdio: "inherit" });
    } catch {
      console.error(
        red(
          `Failed to run ${installCmd}. Please run it manually and try again.`,
        ),
      );
      process.exit(1);
    }
    jsLockFilePath = join(dir, getLockFileName(jsManager));
  }

  if (detection.hasComposerJson && !detection.hasComposerLock) {
    console.log(
      yellow("\nNo composer.lock found. Running composer install..."),
    );
    try {
      execSync("composer install", { cwd: dir, stdio: "inherit" });
    } catch {
      console.error(
        red(
          "Failed to run composer install. Please run it manually and try again.",
        ),
      );
      process.exit(1);
    }
  }

  // Step 3: .npmrc configuration
  if (jsManager) {
    const npmrcOptions = await checkbox({
      message: "Configure .npmrc?",
      choices: [
        {
          name: "save-exact=true — Pin future installs to exact versions",
          value: "save-exact=true",
          checked: true,
        },
        {
          name: "ignore-scripts=true — Block post-install scripts (security)",
          value: "ignore-scripts=true",
          checked: true,
        },
      ],
    });

    if (npmrcOptions.length > 0) {
      updateNpmrc(dir, npmrcOptions);
      console.log(green("Updated .npmrc"));
    }
  }

  // Step 4 & 5: Compute changes for each manager
  const allChanges: ManagerChanges[] = [];

  if (jsManager && jsLockFilePath) {
    const jsDepTypes = await checkbox({
      message: `Which ${jsManager} dependency types to pin?`,
      choices: [
        { name: "dependencies", value: "dependencies", checked: true },
        { name: "devDependencies", value: "devDependencies", checked: true },
        {
          name: "peerDependencies",
          value: "peerDependencies",
          checked: false,
        },
        {
          name: "optionalDependencies",
          value: "optionalDependencies",
          checked: true,
        },
      ],
    });

    const lockContent = readFileSync(jsLockFilePath, "utf-8");
    const lockVersions = parseLockFile(jsManager, lockContent);

    const result = computePinChanges({
      manifestPath: join(dir, "package.json"),
      lockFileVersions: lockVersions,
      depTypes: jsDepTypes,
    });

    allChanges.push({
      manager: jsManager,
      changes: result.changes,
      skipped: result.skipped.length,
      alreadyPinned: result.alreadyPinned.length,
    });

    for (const s of result.skipped) {
      if (s.reason === "not found in lock file") {
        console.log(yellow(`  Warning: ${s.packageName} not found in lock file, skipping`));
      }
    }
  }

  if (detection.hasComposerJson) {
    const composerDepTypes = await checkbox({
      message: "Which composer dependency types to pin?",
      choices: [
        { name: "require", value: "require", checked: true },
        { name: "require-dev", value: "require-dev", checked: true },
      ],
    });

    const composerLockPath = join(dir, "composer.lock");
    const lockContent = readFileSync(composerLockPath, "utf-8");
    const lockVersions = parseComposerLock(lockContent);

    const result = computePinChanges({
      manifestPath: join(dir, "composer.json"),
      lockFileVersions: lockVersions,
      depTypes: composerDepTypes,
    });

    allChanges.push({
      manager: "composer",
      changes: result.changes,
      skipped: result.skipped.length,
      alreadyPinned: result.alreadyPinned.length,
    });

    for (const s of result.skipped) {
      if (s.reason === "not found in lock file") {
        console.log(
          yellow(`  Warning: ${s.packageName} not found in composer.lock, skipping`),
        );
      }
    }
  }

  // Step 5: Preview changes
  const totalChanges = allChanges.reduce((sum, r) => sum + r.changes.length, 0);
  const totalSkipped = allChanges.reduce((sum, r) => sum + r.skipped, 0);
  const totalPinned = allChanges.reduce((sum, r) => sum + r.alreadyPinned, 0);

  if (totalChanges === 0) {
    console.log(green("\nAll dependencies are already pinned! Nothing to do."));
    return;
  }

  console.log(bold("\nChanges to apply:\n"));

  for (const result of allChanges) {
    if (result.changes.length === 0) continue;

    const manifestName =
      result.manager === "composer" ? "composer.json" : "package.json";
    console.log(bold(`${result.manager} (${manifestName}):`));

    const byType = new Map<string, PinChange[]>();
    for (const change of result.changes) {
      if (!byType.has(change.depType)) byType.set(change.depType, []);
      byType.get(change.depType)!.push(change);
    }

    for (const [depType, changes] of byType) {
      console.log(`  ${depType}:`);
      for (const change of changes) {
        console.log(
          `    ${change.packageName}: ${dim(change.oldConstraint)} → ${green(change.newVersion)}`,
        );
      }
    }
    console.log();
  }

  if (totalPinned > 0) {
    console.log(dim(`${totalPinned} packages already pinned (skipped)`));
  }
  if (totalSkipped > 0) {
    console.log(dim(`${totalSkipped} packages skipped (non-version constraints)`));
  }
  console.log(bold(`${totalChanges} packages will be pinned\n`));

  const proceed = await confirm({ message: "Proceed?", default: true });
  if (!proceed) {
    console.log("Cancelled.");
    return;
  }

  // Step 6: Apply changes and run install
  for (const result of allChanges) {
    if (result.changes.length === 0) continue;

    const manifestPath =
      result.manager === "composer"
        ? join(dir, "composer.json")
        : join(dir, "package.json");

    applyPinChanges(manifestPath, result.changes);
  }

  if (
    jsManager &&
    allChanges.some((r) => r.manager !== "composer" && r.changes.length > 0)
  ) {
    const installCmd = getInstallCommand(jsManager);
    console.log(`\nRunning ${bold(installCmd)} to sync lock file...`);
    try {
      execSync(installCmd, { cwd: dir, stdio: "inherit" });
    } catch {
      console.error(
        yellow(`Warning: ${installCmd} failed. You may need to run it manually.`),
      );
    }
  }

  if (allChanges.some((r) => r.manager === "composer" && r.changes.length > 0)) {
    console.log(
      `\nRunning ${bold("composer update --lock")} to sync lock file...`,
    );
    try {
      execSync("composer update --lock", { cwd: dir, stdio: "inherit" });
    } catch {
      console.error(
        yellow(
          "Warning: composer update --lock failed. You may need to run it manually.",
        ),
      );
    }
  }

  console.log(
    green(bold(`\nSuccessfully pinned ${totalChanges} dependencies!\n`)),
  );
}

main().catch((error) => {
  if (error.name === "ExitPromptError") {
    console.log("\nCancelled.");
    process.exit(0);
  }
  console.error(red(error.message));
  process.exit(1);
});
