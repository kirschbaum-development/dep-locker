import { existsSync } from "fs";
import { join } from "path";
import type { DetectionResult, JsPackageManager } from "./types";

const JS_LOCK_FILES: Array<{ file: string; type: JsPackageManager }> = [
  { file: "package-lock.json", type: "npm" },
  { file: "yarn.lock", type: "yarn" },
  { file: "bun.lock", type: "bun" },
];

export function detectManagers(dir: string): DetectionResult {
  return {
    hasPackageJson: existsSync(join(dir, "package.json")),
    jsLockFiles: JS_LOCK_FILES.filter(({ file }) =>
      existsSync(join(dir, file)),
    ).map(({ type, file }) => ({ type, path: join(dir, file) })),
    hasComposerJson: existsSync(join(dir, "composer.json")),
    hasComposerLock: existsSync(join(dir, "composer.lock")),
  };
}
