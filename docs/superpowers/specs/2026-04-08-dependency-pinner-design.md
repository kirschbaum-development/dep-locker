# dependency-pinner Design Spec

## Overview

A Node.js CLI tool published to npm and run via `npx dependency-pinner`. It detects which package managers are in use in the current directory, pins all dependency version constraints to the exact versions resolved in lock files, and configures `.npmrc` for security best practices.

**Motivation:** Supply-chain attacks on npm/Composer packages are increasingly common. Pinning exact versions prevents automatic adoption of compromised releases. Disabling post-install scripts blocks the most common malware injection vector.

## Supported Package Managers

- **npm** — `package.json` + `package-lock.json`
- **yarn** — `package.json` + `yarn.lock`
- **bun** — `package.json` + `bun.lock`
- **composer** — `composer.json` + `composer.lock`

## CLI Flow

### Step 1: Detection

Scan the current directory for manifest files (`package.json`, `composer.json`). For `package.json`, determine the JS package manager by checking for lock files:

- `package-lock.json` exists → npm
- `yarn.lock` exists → yarn
- `bun.lock` exists → bun

If multiple JS lock files exist, treat each as a separate manager. If `package.json` exists but no JS lock file is found, proceed to step 2.

### Step 2: Generate Missing Lock Files

If a manifest exists but no corresponding lock file, run the install command to generate it:

- npm: `npm install`
- yarn: `yarn install`
- bun: `bun install`
- composer: `composer install`

Show a message: "No package-lock.json found, running npm install to generate it..."

### Step 3: .npmrc Configuration

If any JS package manager is detected, show a checkbox prompt with both options checked by default:

- `save-exact=true` — Pin future installs to exact versions
- `ignore-scripts=true` — Block post-install scripts (security)

Create or update the project's `.npmrc` with selected options. If the file already exists, append only missing entries (don't duplicate).

### Step 4: Dependency Type Selection

Show a checkbox prompt per detected manager for which dependency types to pin.

**For npm/yarn/bun:**
- `dependencies` — checked by default
- `devDependencies` — checked by default
- `peerDependencies` — unchecked by default
- `optionalDependencies` — checked by default

**For composer:**
- `require` — checked by default
- `require-dev` — checked by default

### Step 5: Preview Changes

Parse lock files to get resolved versions. Compare against current manifest constraints. Display a summary showing each package that will change:

```
npm (package.json):
  dependencies:
    lodash: ^4.17.0 → 4.17.21
    express: ~4.18.0 → 4.18.2
  devDependencies:
    jest: ^29.0.0 → 29.7.0

composer (composer.json):
  require:
    laravel/framework: ^11.0 → 11.44.2

3 packages already pinned (skipped)
6 packages will be pinned

Proceed? (Y/n)
```

### Step 6: Pin & Install

Write the exact versions to the manifest files. Then run the appropriate install command to sync the lock file:

- npm: `npm install`
- yarn: `yarn install`
- bun: `bun install`
- composer: `composer update --lock`

Show success summary.

## Pinning Logic

### Core Rule

Pin to the lock file's resolved version. Never downgrade.

For each dependency in the manifest:

1. Read current constraint from manifest (e.g., `^4.17.0`)
2. Read resolved version from lock file (e.g., `4.17.21`)
3. If already pinned (exact version, no range operators), skip
4. Write the resolved version as the new constraint

### What Gets Pinned

Any constraint containing range operators: `^`, `~`, `>=`, `>`, `<`, `<=`, `*`, `x`, `||`, spaces (AND ranges), hyphens.

### What Gets Skipped

- Already exact versions (e.g., `4.17.21`)
- Git/URL/file references (e.g., `github:user/repo`, `file:../local`, `https://...`)
- Composer branch aliases (e.g., `dev-main`, `dev-master`)
- Packages not found in the lock file (with a warning)

## Lock File Parsing

Each parser extracts a `Map<packageName, resolvedVersion>`:

- **package-lock.json** (JSON): `packages["node_modules/<name>"].version`
- **yarn.lock** (custom text): regex — each entry block has `version "x.y.z"`
- **bun.lock** (JSON, Bun v1.2+): `packages` object with version info
- **composer.lock** (JSON): `packages[].name` + `packages[].version`, and `packages-dev[].name` + `packages-dev[].version`

## .npmrc Handling

- If `.npmrc` doesn't exist, create it with selected options
- If `.npmrc` exists, read it, append only options not already present
- Each option is written as its own line (e.g., `save-exact=true`)

## Scope

- **Root only** — only processes manifest/lock files in the current directory
- **No workspace/monorepo support** in this version

## Project Structure

```
dependency-pinner/
├── src/
│   ├── index.ts              # Entry point — CLI flow orchestration
│   ├── detector.ts           # Detects which package managers are in use
│   ├── pinners/
│   │   ├── npm.ts            # npm pinning logic
│   │   ├── yarn.ts           # yarn pinning logic
│   │   ├── bun.ts            # bun pinning logic
│   │   └── composer.ts       # composer pinning logic
│   ├── lockfile-parsers/
│   │   ├── package-lock.ts   # Parses package-lock.json
│   │   ├── yarn-lock.ts      # Parses yarn.lock
│   │   ├── bun-lock.ts       # Parses bun.lock
│   │   └── composer-lock.ts  # Parses composer.lock
│   ├── npmrc.ts              # .npmrc configuration logic
│   └── types.ts              # Shared types/interfaces
├── package.json
├── tsconfig.json
└── tsup.config.ts            # Bundle to single JS file for npx
```

## Technology

- **Language:** TypeScript
- **Build:** tsup (bundles to single JS file)
- **Runtime dependency:** `@inquirer/prompts` (checkbox/confirm prompts)
- **Dev dependencies:** `typescript`, `tsup`, `@types/node`
- **Node.js APIs:** `fs`, `child_process`, `path`
- **Terminal colors:** ANSI codes directly (no chalk dependency)

## Error Handling

### Fatal Errors (exit code 1)

- No manifest files found: "No package.json or composer.json found. Run this from your project root."
- Lock file generation fails: show the install command's stderr and exit
- Manifest file isn't valid JSON: "Could not parse package.json: <error>"

### Graceful Skips (warnings)

- Package not found in lock file: "Warning: lodash not found in package-lock.json, skipping"
- Git/URL/branch ref dependencies: skipped silently, shown as "skipped" in preview

### Exit Codes

- `0` — success (even if some packages were skipped)
- `1` — fatal error
