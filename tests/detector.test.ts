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
