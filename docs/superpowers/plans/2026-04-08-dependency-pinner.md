# dependency-pinner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an npx-runnable CLI tool that detects package managers (npm, yarn, bun, composer), pins dependency versions to lock file resolutions, and configures `.npmrc` for supply-chain security.

**Architecture:** TypeScript CLI bundled with tsup into a single JS file. Lock file parsers extract resolved versions, a shared pinner module computes and applies version changes, and the CLI orchestrator handles interactive prompts via `@inquirer/prompts`. Each parser and the pinner are pure functions testable in isolation.

**Tech Stack:** TypeScript, tsup (bundler), `@inquirer/prompts` (runtime dep), vitest (test runner)

---

## File Structure

```
dependency-pinner/
├── src/
│   ├── index.ts                    # CLI entry point — flow orchestration, prompts, output
│   ├── detector.ts                 # Scans cwd for manifests and lock files, returns detection result
│   ├── pinner.ts                   # computePinChanges() and applyPinChanges() — shared for all managers
│   ├── npmrc.ts                    # Reads/creates/updates .npmrc with selected options
│   ├── utils.ts                    # isExactVersion(), isSkippableConstraint() helpers
│   ├── types.ts                    # Shared TypeScript interfaces
│   └── lockfile-parsers/
│       ├── package-lock.ts         # Parses package-lock.json (v1 + v2/v3) → Map<name, version>
│       ├── yarn-lock.ts            # Parses yarn.lock (classic + berry) → Map<name, version>
│       ├── bun-lock.ts             # Parses bun.lock (JSON, Bun v1.2+) → Map<name, version>
│       └── composer-lock.ts        # Parses composer.lock → Map<name, version>
├── tests/
│   ├── utils.test.ts
│   ├── detector.test.ts
│   ├── pinner.test.ts
│   ├── npmrc.test.ts
│   └── lockfile-parsers/
│       ├── package-lock.test.ts
│       ├── yarn-lock.test.ts
│       ├── bun-lock.test.ts
│       └── composer-lock.test.ts
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsup.config.ts`
- Create: `src/index.ts` (placeholder)

- [ ] **Step 1: Create package.json**

```json
{
  "name": "dependency-pinner",
  "version": "0.1.0",
  "description": "Pin dependency versions to lock file resolutions for supply-chain security",
  "type": "module",
  "bin": {
    "dependency-pinner": "./dist/index.js"
  },
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "prepublishOnly": "npm run build"
  },
  "keywords": [
    "security",
    "dependencies",
    "pin",
    "supply-chain",
    "npm",
    "yarn",
    "bun",
    "composer"
  ],
  "license": "MIT",
  "engines": {
    "node": ">=18"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": false,
    "sourceMap": false
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create tsup.config.ts**

```typescript
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node18",
  clean: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
```

- [ ] **Step 4: Create placeholder src/index.ts**

```typescript
console.log("dependency-pinner");
```

- [ ] **Step 5: Install dependencies**

Run: `npm install @inquirer/prompts`
Run: `npm install -D typescript tsup @types/node vitest`

- [ ] **Step 6: Verify build works**

Run: `npm run build`
Expected: `dist/index.js` created with shebang line.

Run: `node dist/index.js`
Expected: Prints "dependency-pinner"

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json tsup.config.ts src/index.ts package-lock.json
git commit -m "chore: scaffold project with TypeScript, tsup, vitest"
```

---

### Task 2: Types and Version Utilities

**Files:**
- Create: `src/types.ts`
- Create: `src/utils.ts`
- Create: `tests/utils.test.ts`

- [ ] **Step 1: Create src/types.ts**

```typescript
export type JsPackageManager = "npm" | "yarn" | "bun";
export type PackageManager = JsPackageManager | "composer";

export interface PinChange {
  packageName: string;
  depType: string;
  oldConstraint: string;
  newVersion: string;
}

export interface SkippedPackage {
  packageName: string;
  reason: string;
}

export interface PinResult {
  changes: PinChange[];
  skipped: SkippedPackage[];
  alreadyPinned: string[];
}

export interface DetectionResult {
  hasPackageJson: boolean;
  jsLockFiles: Array<{ type: JsPackageManager; path: string }>;
  hasComposerJson: boolean;
  hasComposerLock: boolean;
}
```

- [ ] **Step 2: Write failing tests for version utilities**

```typescript
// tests/utils.test.ts
import { describe, it, expect } from "vitest";
import { isExactVersion, isSkippableConstraint } from "../src/utils";

describe("isExactVersion", () => {
  it("returns true for exact semver versions", () => {
    expect(isExactVersion("4.17.21")).toBe(true);
    expect(isExactVersion("1.0.0")).toBe(true);
    expect(isExactVersion("0.1.0")).toBe(true);
    expect(isExactVersion("1.2.3-beta.1")).toBe(true);
    expect(isExactVersion("2.0.0-rc.1")).toBe(true);
  });

  it("returns false for range constraints", () => {
    expect(isExactVersion("^4.17.0")).toBe(false);
    expect(isExactVersion("~4.17.0")).toBe(false);
    expect(isExactVersion(">=1.0.0")).toBe(false);
    expect(isExactVersion(">1.0.0")).toBe(false);
    expect(isExactVersion("<2.0.0")).toBe(false);
    expect(isExactVersion("<=2.0.0")).toBe(false);
    expect(isExactVersion("*")).toBe(false);
    expect(isExactVersion("1.x")).toBe(false);
    expect(isExactVersion("1.2.x")).toBe(false);
    expect(isExactVersion("1.0.0 || 2.0.0")).toBe(false);
    expect(isExactVersion(">=1.0.0 <2.0.0")).toBe(false);
    expect(isExactVersion("latest")).toBe(false);
  });

  it("returns false for empty or invalid strings", () => {
    expect(isExactVersion("")).toBe(false);
  });

  it("handles composer-style versions", () => {
    expect(isExactVersion("11.44.2")).toBe(true);
    expect(isExactVersion("^11.0")).toBe(false);
    expect(isExactVersion("~11.0")).toBe(false);
    expect(isExactVersion("11.0.*")).toBe(false);
  });
});

describe("isSkippableConstraint", () => {
  it("returns true for git/URL references", () => {
    expect(isSkippableConstraint("github:user/repo")).toBe(true);
    expect(isSkippableConstraint("git+https://github.com/user/repo.git")).toBe(true);
    expect(isSkippableConstraint("git://github.com/user/repo.git")).toBe(true);
    expect(isSkippableConstraint("https://github.com/user/repo.git")).toBe(true);
    expect(isSkippableConstraint("http://example.com/pkg.tgz")).toBe(true);
    expect(isSkippableConstraint("file:../local-pkg")).toBe(true);
  });

  it("returns true for npm aliases and protocols", () => {
    expect(isSkippableConstraint("npm:other-package@^1.0.0")).toBe(true);
    expect(isSkippableConstraint("link:../other")).toBe(true);
    expect(isSkippableConstraint("workspace:*")).toBe(true);
  });

  it("returns true for composer branch aliases", () => {
    expect(isSkippableConstraint("dev-main")).toBe(true);
    expect(isSkippableConstraint("dev-master")).toBe(true);
    expect(isSkippableConstraint("dev-feature/my-branch")).toBe(true);
  });

  it("returns false for normal version constraints", () => {
    expect(isSkippableConstraint("^4.17.0")).toBe(false);
    expect(isSkippableConstraint("~1.0.0")).toBe(false);
    expect(isSkippableConstraint("1.0.0")).toBe(false);
    expect(isSkippableConstraint("*")).toBe(false);
    expect(isSkippableConstraint("latest")).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/utils.test.ts`
Expected: FAIL — `../src/utils` module not found.

- [ ] **Step 4: Implement src/utils.ts**

```typescript
export function isExactVersion(constraint: string): boolean {
  if (!constraint || constraint === "latest") return false;
  if (/[\^~>=<*|]/.test(constraint)) return false;
  if (constraint.includes(" ") || constraint.includes(",")) return false;
  if (/\d+\.x/i.test(constraint)) return false;
  return /^\d+(\.\d+)*(-[\w.+]+)?$/.test(constraint);
}

export function isSkippableConstraint(constraint: string): boolean {
  if (
    /^(github:|git[+:]|git:\/\/|https?:|file:|link:|workspace:|npm:)/.test(
      constraint,
    )
  )
    return true;
  if (/^dev-/.test(constraint)) return true;
  return false;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/utils.test.ts`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/utils.ts tests/utils.test.ts
git commit -m "feat: add shared types and version utility functions"
```

---

### Task 3: Lock File Parsers

**Files:**
- Create: `src/lockfile-parsers/package-lock.ts`
- Create: `src/lockfile-parsers/yarn-lock.ts`
- Create: `src/lockfile-parsers/bun-lock.ts`
- Create: `src/lockfile-parsers/composer-lock.ts`
- Create: `tests/lockfile-parsers/package-lock.test.ts`
- Create: `tests/lockfile-parsers/yarn-lock.test.ts`
- Create: `tests/lockfile-parsers/bun-lock.test.ts`
- Create: `tests/lockfile-parsers/composer-lock.test.ts`

- [ ] **Step 1: Write failing test for package-lock.json parser**

```typescript
// tests/lockfile-parsers/package-lock.test.ts
import { describe, it, expect } from "vitest";
import { parsePackageLock } from "../../src/lockfile-parsers/package-lock";

describe("parsePackageLock", () => {
  it("parses v3 format (packages object)", () => {
    const content = JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": { name: "my-project", version: "1.0.0" },
        "node_modules/lodash": { version: "4.17.21" },
        "node_modules/@types/node": { version: "20.11.0" },
        "node_modules/express/node_modules/debug": { version: "2.6.9" },
      },
    });

    const result = parsePackageLock(content);
    expect(result.get("lodash")).toBe("4.17.21");
    expect(result.get("@types/node")).toBe("20.11.0");
    // Nested packages should NOT be included
    expect(result.has("debug")).toBe(false);
  });

  it("parses v1 format (dependencies object)", () => {
    const content = JSON.stringify({
      lockfileVersion: 1,
      dependencies: {
        lodash: { version: "4.17.21" },
        express: { version: "4.18.2" },
      },
    });

    const result = parsePackageLock(content);
    expect(result.get("lodash")).toBe("4.17.21");
    expect(result.get("express")).toBe("4.18.2");
  });

  it("returns empty map for empty lockfile", () => {
    const content = JSON.stringify({ lockfileVersion: 3, packages: {} });
    const result = parsePackageLock(content);
    expect(result.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lockfile-parsers/package-lock.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement package-lock.ts**

```typescript
// src/lockfile-parsers/package-lock.ts
export function parsePackageLock(content: string): Map<string, string> {
  const lockfile = JSON.parse(content);
  const versions = new Map<string, string>();

  // v2/v3 format: packages object with "node_modules/<name>" keys
  if (lockfile.packages) {
    for (const [key, value] of Object.entries(lockfile.packages)) {
      const match = key.match(/^node_modules\/((?:@[^/]+\/)?[^/]+)$/);
      if (match && (value as Record<string, string>).version) {
        versions.set(match[1], (value as Record<string, string>).version);
      }
    }
  }

  // v1 format fallback: top-level dependencies object
  if (versions.size === 0 && lockfile.dependencies) {
    for (const [name, value] of Object.entries(lockfile.dependencies)) {
      if ((value as Record<string, string>).version) {
        versions.set(name, (value as Record<string, string>).version);
      }
    }
  }

  return versions;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lockfile-parsers/package-lock.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Write failing test for yarn.lock parser**

```typescript
// tests/lockfile-parsers/yarn-lock.test.ts
import { describe, it, expect } from "vitest";
import { parseYarnLock } from "../../src/lockfile-parsers/yarn-lock";

describe("parseYarnLock", () => {
  it("parses yarn classic (v1) format", () => {
    const content = `# yarn lockfile v1


lodash@^4.17.0:
  version "4.17.21"
  resolved "https://registry.yarnpkg.com/lodash/-/lodash-4.17.21.tgz"
  integrity sha512-abc

"@types/node@^18.0.0":
  version "18.19.8"
  resolved "https://registry.yarnpkg.com/@types/node/-/node-18.19.8.tgz"
  integrity sha512-def
`;

    const result = parseYarnLock(content);
    expect(result.get("lodash")).toBe("4.17.21");
    expect(result.get("@types/node")).toBe("18.19.8");
  });

  it("parses yarn berry (v2+) format", () => {
    const content = `__metadata:
  version: 8
  cacheKey: 10

"lodash@npm:^4.17.0":
  version: 4.17.21
  resolution: "lodash@npm:4.17.21"
  checksum: abc

"@types/node@npm:^18.0.0":
  version: 18.19.8
  resolution: "@types/node@npm:18.19.8"
  checksum: def
`;

    const result = parseYarnLock(content);
    expect(result.get("lodash")).toBe("4.17.21");
    expect(result.get("@types/node")).toBe("18.19.8");
  });

  it("handles multiple constraint entries for same package", () => {
    const content = `lodash@^4.17.0, lodash@^4.17.21:
  version "4.17.21"
  resolved "https://registry.yarnpkg.com/lodash/-/lodash-4.17.21.tgz"
`;

    const result = parseYarnLock(content);
    expect(result.get("lodash")).toBe("4.17.21");
  });

  it("returns empty map for empty content", () => {
    const result = parseYarnLock("# yarn lockfile v1\n");
    expect(result.size).toBe(0);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run tests/lockfile-parsers/yarn-lock.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement yarn-lock.ts**

```typescript
// src/lockfile-parsers/yarn-lock.ts
export function parseYarnLock(content: string): Map<string, string> {
  const versions = new Map<string, string>();

  // Split into blocks — each block starts at a non-indented, non-comment line
  const blocks = content.split(/\n(?=\S)/);

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length < 2) continue;

    const header = lines[0];

    // Skip comments and metadata
    if (header.startsWith("#") || header.startsWith("__metadata")) continue;

    // Extract package name from header
    // Handles: lodash@^4.17.0: / "lodash@npm:^4.17.0": / "@types/node@^18.0.0":
    // For multiple constraints: lodash@^4.17.0, lodash@^4.17.21:
    const nameMatch = header.match(/^"?((?:@[^@"]+\/)?[^@"]+)@/);
    if (!nameMatch) continue;

    const name = nameMatch[1];

    // Extract version from the block
    // Handles: version "4.17.21" (classic) / version: 4.17.21 (berry)
    const versionLine = lines.find((l) => l.trim().startsWith("version"));
    if (!versionLine) continue;

    const versionMatch = versionLine.match(/version[:\s]+"?([^"\s]+)"?/);
    if (!versionMatch) continue;

    versions.set(name, versionMatch[1]);
  }

  return versions;
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run tests/lockfile-parsers/yarn-lock.test.ts`
Expected: All tests PASS.

- [ ] **Step 9: Write failing test for bun.lock parser**

```typescript
// tests/lockfile-parsers/bun-lock.test.ts
import { describe, it, expect } from "vitest";
import { parseBunLock } from "../../src/lockfile-parsers/bun-lock";

describe("parseBunLock", () => {
  it("parses bun.lock JSON format", () => {
    const content = JSON.stringify({
      lockfileVersion: 1,
      workspaces: {
        "": {
          name: "my-project",
          dependencies: { lodash: "^4.17.21" },
        },
      },
      packages: {
        lodash: ["lodash@4.17.21", "", {}, "sha512-abc"],
        "@types/node": ["@types/node@20.11.0", "", {}, "sha512-def"],
        express: ["express@4.18.2", "", { dependencies: { debug: "2.6.9" } }, "sha512-ghi"],
      },
    });

    const result = parseBunLock(content);
    expect(result.get("lodash")).toBe("4.17.21");
    expect(result.get("@types/node")).toBe("20.11.0");
    expect(result.get("express")).toBe("4.18.2");
  });

  it("returns empty map for empty packages", () => {
    const content = JSON.stringify({ lockfileVersion: 1, packages: {} });
    const result = parseBunLock(content);
    expect(result.size).toBe(0);
  });
});
```

- [ ] **Step 10: Run test to verify it fails**

Run: `npx vitest run tests/lockfile-parsers/bun-lock.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 11: Implement bun-lock.ts**

```typescript
// src/lockfile-parsers/bun-lock.ts
export function parseBunLock(content: string): Map<string, string> {
  const lockfile = JSON.parse(content);
  const versions = new Map<string, string>();

  const packages = lockfile.packages || {};
  for (const [name, entry] of Object.entries(packages)) {
    if (!Array.isArray(entry) || entry.length === 0) continue;

    const identifier = entry[0] as string; // e.g., "lodash@4.17.21" or "@types/node@20.11.0"

    // Extract version: everything after the last @
    // For scoped packages like @types/node@20.11.0, lastIndexOf('@') gets the version separator
    const atIndex = identifier.lastIndexOf("@");
    if (atIndex > 0) {
      versions.set(name, identifier.substring(atIndex + 1));
    }
  }

  return versions;
}
```

- [ ] **Step 12: Run test to verify it passes**

Run: `npx vitest run tests/lockfile-parsers/bun-lock.test.ts`
Expected: All tests PASS.

- [ ] **Step 13: Write failing test for composer.lock parser**

```typescript
// tests/lockfile-parsers/composer-lock.test.ts
import { describe, it, expect } from "vitest";
import { parseComposerLock } from "../../src/lockfile-parsers/composer-lock";

describe("parseComposerLock", () => {
  it("parses packages and packages-dev", () => {
    const content = JSON.stringify({
      packages: [
        { name: "laravel/framework", version: "v11.44.2" },
        { name: "guzzlehttp/guzzle", version: "7.8.1" },
      ],
      "packages-dev": [
        { name: "phpunit/phpunit", version: "v11.5.3" },
      ],
    });

    const result = parseComposerLock(content);
    expect(result.get("laravel/framework")).toBe("11.44.2");
    expect(result.get("guzzlehttp/guzzle")).toBe("7.8.1");
    expect(result.get("phpunit/phpunit")).toBe("11.5.3");
  });

  it("strips v prefix from versions", () => {
    const content = JSON.stringify({
      packages: [{ name: "some/package", version: "v2.0.0" }],
      "packages-dev": [],
    });

    const result = parseComposerLock(content);
    expect(result.get("some/package")).toBe("2.0.0");
  });

  it("returns empty map for empty lockfile", () => {
    const content = JSON.stringify({ packages: [], "packages-dev": [] });
    const result = parseComposerLock(content);
    expect(result.size).toBe(0);
  });
});
```

- [ ] **Step 14: Run test to verify it fails**

Run: `npx vitest run tests/lockfile-parsers/composer-lock.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 15: Implement composer-lock.ts**

```typescript
// src/lockfile-parsers/composer-lock.ts
export function parseComposerLock(content: string): Map<string, string> {
  const lockfile = JSON.parse(content);
  const versions = new Map<string, string>();

  for (const pkg of lockfile.packages || []) {
    if (pkg.name && pkg.version) {
      versions.set(pkg.name, pkg.version.replace(/^v/, ""));
    }
  }

  for (const pkg of lockfile["packages-dev"] || []) {
    if (pkg.name && pkg.version) {
      versions.set(pkg.name, pkg.version.replace(/^v/, ""));
    }
  }

  return versions;
}
```

- [ ] **Step 16: Run test to verify it passes**

Run: `npx vitest run tests/lockfile-parsers/composer-lock.test.ts`
Expected: All tests PASS.

- [ ] **Step 17: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 18: Commit**

```bash
git add src/lockfile-parsers/ tests/lockfile-parsers/
git commit -m "feat: add lock file parsers for npm, yarn, bun, and composer"
```

---

### Task 4: Detector

**Files:**
- Create: `src/detector.ts`
- Create: `tests/detector.test.ts`

- [ ] **Step 1: Write failing tests for detector**

```typescript
// tests/detector.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { detectManagers } from "../src/detector";

describe("detectManagers", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "dep-pinner-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("detects npm when package.json and package-lock.json exist", () => {
    writeFileSync(join(tempDir, "package.json"), "{}");
    writeFileSync(join(tempDir, "package-lock.json"), "{}");

    const result = detectManagers(tempDir);
    expect(result.hasPackageJson).toBe(true);
    expect(result.jsLockFiles).toEqual([
      { type: "npm", path: join(tempDir, "package-lock.json") },
    ]);
  });

  it("detects yarn when package.json and yarn.lock exist", () => {
    writeFileSync(join(tempDir, "package.json"), "{}");
    writeFileSync(join(tempDir, "yarn.lock"), "");

    const result = detectManagers(tempDir);
    expect(result.jsLockFiles).toEqual([
      { type: "yarn", path: join(tempDir, "yarn.lock") },
    ]);
  });

  it("detects bun when package.json and bun.lock exist", () => {
    writeFileSync(join(tempDir, "package.json"), "{}");
    writeFileSync(join(tempDir, "bun.lock"), "{}");

    const result = detectManagers(tempDir);
    expect(result.jsLockFiles).toEqual([
      { type: "bun", path: join(tempDir, "bun.lock") },
    ]);
  });

  it("detects multiple JS lock files", () => {
    writeFileSync(join(tempDir, "package.json"), "{}");
    writeFileSync(join(tempDir, "package-lock.json"), "{}");
    writeFileSync(join(tempDir, "yarn.lock"), "");

    const result = detectManagers(tempDir);
    expect(result.jsLockFiles).toHaveLength(2);
  });

  it("detects package.json with no lock file", () => {
    writeFileSync(join(tempDir, "package.json"), "{}");

    const result = detectManagers(tempDir);
    expect(result.hasPackageJson).toBe(true);
    expect(result.jsLockFiles).toHaveLength(0);
  });

  it("detects composer.json and composer.lock", () => {
    writeFileSync(join(tempDir, "composer.json"), "{}");
    writeFileSync(join(tempDir, "composer.lock"), "{}");

    const result = detectManagers(tempDir);
    expect(result.hasComposerJson).toBe(true);
    expect(result.hasComposerLock).toBe(true);
  });

  it("detects composer.json without composer.lock", () => {
    writeFileSync(join(tempDir, "composer.json"), "{}");

    const result = detectManagers(tempDir);
    expect(result.hasComposerJson).toBe(true);
    expect(result.hasComposerLock).toBe(false);
  });

  it("detects nothing in empty directory", () => {
    const result = detectManagers(tempDir);
    expect(result.hasPackageJson).toBe(false);
    expect(result.jsLockFiles).toHaveLength(0);
    expect(result.hasComposerJson).toBe(false);
    expect(result.hasComposerLock).toBe(false);
  });

  it("detects both JS and composer managers together", () => {
    writeFileSync(join(tempDir, "package.json"), "{}");
    writeFileSync(join(tempDir, "package-lock.json"), "{}");
    writeFileSync(join(tempDir, "composer.json"), "{}");
    writeFileSync(join(tempDir, "composer.lock"), "{}");

    const result = detectManagers(tempDir);
    expect(result.hasPackageJson).toBe(true);
    expect(result.jsLockFiles).toHaveLength(1);
    expect(result.hasComposerJson).toBe(true);
    expect(result.hasComposerLock).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/detector.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement src/detector.ts**

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/detector.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/detector.ts tests/detector.test.ts
git commit -m "feat: add package manager detection"
```

---

### Task 5: .npmrc Handler

**Files:**
- Create: `src/npmrc.ts`
- Create: `tests/npmrc.test.ts`

- [ ] **Step 1: Write failing tests for .npmrc handler**

```typescript
// tests/npmrc.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { updateNpmrc } from "../src/npmrc";

describe("updateNpmrc", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "dep-pinner-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates .npmrc with selected options when file does not exist", () => {
    updateNpmrc(tempDir, ["save-exact=true", "ignore-scripts=true"]);

    const content = readFileSync(join(tempDir, ".npmrc"), "utf-8");
    expect(content).toBe("save-exact=true\nignore-scripts=true\n");
  });

  it("appends missing options to existing .npmrc", () => {
    writeFileSync(join(tempDir, ".npmrc"), "save-exact=true\n");

    updateNpmrc(tempDir, ["save-exact=true", "ignore-scripts=true"]);

    const content = readFileSync(join(tempDir, ".npmrc"), "utf-8");
    expect(content).toBe("save-exact=true\nignore-scripts=true\n");
  });

  it("does not duplicate existing options", () => {
    writeFileSync(
      join(tempDir, ".npmrc"),
      "save-exact=true\nignore-scripts=true\n",
    );

    updateNpmrc(tempDir, ["save-exact=true", "ignore-scripts=true"]);

    const content = readFileSync(join(tempDir, ".npmrc"), "utf-8");
    expect(content).toBe("save-exact=true\nignore-scripts=true\n");
  });

  it("preserves existing content when adding new options", () => {
    writeFileSync(join(tempDir, ".npmrc"), "registry=https://custom.registry\n");

    updateNpmrc(tempDir, ["save-exact=true"]);

    const content = readFileSync(join(tempDir, ".npmrc"), "utf-8");
    expect(content).toBe(
      "registry=https://custom.registry\nsave-exact=true\n",
    );
  });

  it("does nothing when no options selected", () => {
    updateNpmrc(tempDir, []);

    const exists = require("fs").existsSync(join(tempDir, ".npmrc"));
    expect(exists).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/npmrc.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement src/npmrc.ts**

```typescript
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

export function updateNpmrc(dir: string, options: string[]): void {
  if (options.length === 0) return;

  const npmrcPath = join(dir, ".npmrc");
  let content = "";

  if (existsSync(npmrcPath)) {
    content = readFileSync(npmrcPath, "utf-8");
  }

  const existingKeys = new Set(
    content
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => l.split("=")[0].trim()),
  );

  const toAdd = options.filter((opt) => !existingKeys.has(opt.split("=")[0]));

  if (toAdd.length === 0) return;

  const newContent =
    content.trimEnd() + (content.trim() ? "\n" : "") + toAdd.join("\n") + "\n";
  writeFileSync(npmrcPath, newContent);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/npmrc.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/npmrc.ts tests/npmrc.test.ts
git commit -m "feat: add .npmrc configuration handler"
```

---

### Task 6: Pinner Logic

**Files:**
- Create: `src/pinner.ts`
- Create: `tests/pinner.test.ts`

- [ ] **Step 1: Write failing tests for computePinChanges**

```typescript
// tests/pinner.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { computePinChanges, applyPinChanges } from "../src/pinner";

describe("computePinChanges", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "dep-pinner-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("computes changes for range constraints", () => {
    const manifestPath = join(tempDir, "package.json");
    writeFileSync(
      manifestPath,
      JSON.stringify({
        dependencies: {
          lodash: "^4.17.0",
          express: "~4.18.0",
        },
      }),
    );

    const lockVersions = new Map([
      ["lodash", "4.17.21"],
      ["express", "4.18.2"],
    ]);

    const result = computePinChanges({
      manifestPath,
      lockFileVersions: lockVersions,
      depTypes: ["dependencies"],
    });

    expect(result.changes).toEqual([
      {
        packageName: "lodash",
        depType: "dependencies",
        oldConstraint: "^4.17.0",
        newVersion: "4.17.21",
      },
      {
        packageName: "express",
        depType: "dependencies",
        oldConstraint: "~4.18.0",
        newVersion: "4.18.2",
      },
    ]);
    expect(result.alreadyPinned).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it("skips already-pinned versions", () => {
    const manifestPath = join(tempDir, "package.json");
    writeFileSync(
      manifestPath,
      JSON.stringify({
        dependencies: {
          lodash: "4.17.21",
          express: "^4.18.0",
        },
      }),
    );

    const lockVersions = new Map([
      ["lodash", "4.17.21"],
      ["express", "4.18.2"],
    ]);

    const result = computePinChanges({
      manifestPath,
      lockFileVersions: lockVersions,
      depTypes: ["dependencies"],
    });

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].packageName).toBe("express");
    expect(result.alreadyPinned).toEqual(["lodash"]);
  });

  it("skips non-version constraints", () => {
    const manifestPath = join(tempDir, "package.json");
    writeFileSync(
      manifestPath,
      JSON.stringify({
        dependencies: {
          "local-pkg": "file:../local",
          "git-pkg": "github:user/repo",
          lodash: "^4.17.0",
        },
      }),
    );

    const lockVersions = new Map([["lodash", "4.17.21"]]);

    const result = computePinChanges({
      manifestPath,
      lockFileVersions: lockVersions,
      depTypes: ["dependencies"],
    });

    expect(result.changes).toHaveLength(1);
    expect(result.skipped).toHaveLength(2);
    expect(result.skipped[0].reason).toBe("non-version constraint");
  });

  it("warns when package not found in lock file", () => {
    const manifestPath = join(tempDir, "package.json");
    writeFileSync(
      manifestPath,
      JSON.stringify({
        dependencies: {
          lodash: "^4.17.0",
          missing: "^1.0.0",
        },
      }),
    );

    const lockVersions = new Map([["lodash", "4.17.21"]]);

    const result = computePinChanges({
      manifestPath,
      lockFileVersions: lockVersions,
      depTypes: ["dependencies"],
    });

    expect(result.changes).toHaveLength(1);
    expect(result.skipped).toEqual([
      { packageName: "missing", reason: "not found in lock file" },
    ]);
  });

  it("handles multiple dep types", () => {
    const manifestPath = join(tempDir, "package.json");
    writeFileSync(
      manifestPath,
      JSON.stringify({
        dependencies: { lodash: "^4.17.0" },
        devDependencies: { vitest: "^1.0.0" },
      }),
    );

    const lockVersions = new Map([
      ["lodash", "4.17.21"],
      ["vitest", "1.6.0"],
    ]);

    const result = computePinChanges({
      manifestPath,
      lockFileVersions: lockVersions,
      depTypes: ["dependencies", "devDependencies"],
    });

    expect(result.changes).toHaveLength(2);
    expect(result.changes[0].depType).toBe("dependencies");
    expect(result.changes[1].depType).toBe("devDependencies");
  });

  it("handles composer require and require-dev", () => {
    const manifestPath = join(tempDir, "composer.json");
    writeFileSync(
      manifestPath,
      JSON.stringify({
        require: {
          "php": "^8.2",
          "laravel/framework": "^11.0",
        },
        "require-dev": {
          "phpunit/phpunit": "^11.0",
        },
      }),
    );

    const lockVersions = new Map([
      ["laravel/framework", "11.44.2"],
      ["phpunit/phpunit", "11.5.3"],
    ]);

    const result = computePinChanges({
      manifestPath,
      lockFileVersions: lockVersions,
      depTypes: ["require", "require-dev"],
    });

    // php constraint is not in lock file → skipped
    expect(result.changes).toHaveLength(2);
    expect(result.changes[0].packageName).toBe("laravel/framework");
    expect(result.changes[1].packageName).toBe("phpunit/phpunit");
    expect(result.skipped).toEqual([
      { packageName: "php", reason: "not found in lock file" },
    ]);
  });

  it("skips composer dev- branch constraints", () => {
    const manifestPath = join(tempDir, "composer.json");
    writeFileSync(
      manifestPath,
      JSON.stringify({
        require: {
          "some/package": "dev-main",
          "other/package": "^1.0",
        },
      }),
    );

    const lockVersions = new Map([["other/package", "1.5.0"]]);

    const result = computePinChanges({
      manifestPath,
      lockFileVersions: lockVersions,
      depTypes: ["require"],
    });

    expect(result.changes).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].packageName).toBe("some/package");
  });
});

describe("applyPinChanges", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "dep-pinner-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes exact versions to the manifest", () => {
    const manifestPath = join(tempDir, "package.json");
    writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          dependencies: { lodash: "^4.17.0", express: "~4.18.0" },
          devDependencies: { vitest: "^1.0.0" },
        },
        null,
        2,
      ) + "\n",
    );

    applyPinChanges(manifestPath, [
      {
        packageName: "lodash",
        depType: "dependencies",
        oldConstraint: "^4.17.0",
        newVersion: "4.17.21",
      },
      {
        packageName: "express",
        depType: "dependencies",
        oldConstraint: "~4.18.0",
        newVersion: "4.18.2",
      },
      {
        packageName: "vitest",
        depType: "devDependencies",
        oldConstraint: "^1.0.0",
        newVersion: "1.6.0",
      },
    ]);

    const updated = JSON.parse(readFileSync(manifestPath, "utf-8"));
    expect(updated.dependencies.lodash).toBe("4.17.21");
    expect(updated.dependencies.express).toBe("4.18.2");
    expect(updated.devDependencies.vitest).toBe("1.6.0");
  });

  it("preserves original indentation", () => {
    const manifestPath = join(tempDir, "package.json");
    const original = JSON.stringify(
      { dependencies: { lodash: "^4.17.0" } },
      null,
      4,
    ) + "\n";
    writeFileSync(manifestPath, original);

    applyPinChanges(manifestPath, [
      {
        packageName: "lodash",
        depType: "dependencies",
        oldConstraint: "^4.17.0",
        newVersion: "4.17.21",
      },
    ]);

    const content = readFileSync(manifestPath, "utf-8");
    // Should use 4-space indentation like the original
    expect(content).toContain('    "lodash"');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/pinner.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement src/pinner.ts**

```typescript
import { readFileSync, writeFileSync } from "fs";
import type { PinChange, PinResult, SkippedPackage } from "./types";
import { isExactVersion, isSkippableConstraint } from "./utils";

export interface ComputePinChangesOptions {
  manifestPath: string;
  lockFileVersions: Map<string, string>;
  depTypes: string[];
}

export function computePinChanges(options: ComputePinChangesOptions): PinResult {
  const content = readFileSync(options.manifestPath, "utf-8");
  const manifest = JSON.parse(content);
  const changes: PinChange[] = [];
  const skipped: SkippedPackage[] = [];
  const alreadyPinned: string[] = [];

  for (const depType of options.depTypes) {
    const deps = manifest[depType] || {};
    for (const [name, constraint] of Object.entries(deps)) {
      const constraintStr = constraint as string;

      if (isExactVersion(constraintStr)) {
        alreadyPinned.push(name);
        continue;
      }

      if (isSkippableConstraint(constraintStr)) {
        skipped.push({ packageName: name, reason: "non-version constraint" });
        continue;
      }

      const resolvedVersion = options.lockFileVersions.get(name);
      if (!resolvedVersion) {
        skipped.push({ packageName: name, reason: "not found in lock file" });
        continue;
      }

      changes.push({
        packageName: name,
        depType,
        oldConstraint: constraintStr,
        newVersion: resolvedVersion,
      });
    }
  }

  return { changes, skipped, alreadyPinned };
}

function detectIndentation(content: string): number | string {
  const match = content.match(/\n([ \t]+)/);
  if (!match) return 2;
  if (match[1].includes("\t")) return "\t";
  return match[1].length;
}

export function applyPinChanges(
  manifestPath: string,
  changes: PinChange[],
): void {
  const content = readFileSync(manifestPath, "utf-8");
  const indent = detectIndentation(content);
  const manifest = JSON.parse(content);

  for (const change of changes) {
    if (manifest[change.depType]?.[change.packageName] !== undefined) {
      manifest[change.depType][change.packageName] = change.newVersion;
    }
  }

  writeFileSync(manifestPath, JSON.stringify(manifest, null, indent) + "\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/pinner.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pinner.ts tests/pinner.test.ts
git commit -m "feat: add pin change computation and manifest writing"
```

---

### Task 7: CLI Orchestration

**Files:**
- Modify: `src/index.ts` (replace placeholder)

- [ ] **Step 1: Implement src/index.ts**

Replace the placeholder with the full CLI orchestration:

```typescript
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

  console.log(bold("\ndependency-pinner\n"));

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
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: `dist/index.js` created successfully.

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: add CLI orchestration with interactive prompts"
```

---

### Task 8: Build, End-to-End Verification, and Publish Prep

**Files:**
- Modify: `package.json` (if needed)

- [ ] **Step 1: Build the project**

Run: `npm run build`
Expected: `dist/index.js` created with shebang.

- [ ] **Step 2: Make dist/index.js executable**

Run: `chmod +x dist/index.js`

- [ ] **Step 3: Test in a real npm project**

Create a temporary test project and run the tool against it:

```bash
mkdir -p /tmp/test-dep-pinner
cd /tmp/test-dep-pinner
npm init -y
npm install lodash@^4.17.0 express@^4.18.0
```

Then run:
```bash
node /Users/luisdalmolin/Projects/open-source/dependency-pinner/dist/index.js
```

Expected: The tool detects npm, shows the `.npmrc` configuration prompt, dependency type selection, previews changes showing `lodash` and `express` constraints being pinned to their resolved versions, and on confirmation, writes the exact versions to `package.json` and runs `npm install`.

Verify `package.json` in the test project now has exact versions (no `^` or `~`).

- [ ] **Step 4: Test in a project with already-pinned deps**

Edit the test project's `package.json` to have all exact versions, then run the tool again.

Expected: "All dependencies are already pinned! Nothing to do."

- [ ] **Step 5: Run all tests one final time**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: build verification and publish prep"
```
