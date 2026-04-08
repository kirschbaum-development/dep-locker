# dep-locker

Pin dependency versions to their lock file resolutions for supply-chain security.

## Why This Exists

Software supply-chain attacks are no longer rare — they happen almost weekly. Attackers compromise maintainer accounts or take over abandoned packages, then push new versions containing malware. Because most projects use range constraints like `^1.2.0` or `~1.2.0`, a simple `npm install` or `composer update` can silently pull in a compromised release.

The two most effective defenses are straightforward:

1. **Pin exact versions** — so your project only installs the versions you've vetted, not whatever is newest
2. **Disable post-install scripts** — since `postinstall` is the primary vector attackers use to execute malicious code

This tool automates both. It reads your lock file to find the versions you're actually running, pins your manifest to those exact versions, and configures `.npmrc` to enforce these practices going forward.

## Usage

Run in your project root:

```bash
npx @kirschbaum-development/dep-locker
```

The tool will:

1. **Detect** which package managers are in use (npm, yarn, bun, composer)
2. **Configure `.npmrc`** with security best practices (`save-exact=true`, `ignore-scripts=true`)
3. **Pin all dependencies** to the exact versions resolved in your lock file
4. **Re-run install** to sync the lock file with the updated constraints

## Supported Package Managers

| Manager  | Manifest          | Lock File            |
|----------|-------------------|----------------------|
| npm      | `package.json`    | `package-lock.json`  |
| yarn     | `package.json`    | `yarn.lock`          |
| bun      | `package.json`    | `bun.lock`           |
| composer | `composer.json`   | `composer.lock`      |

## What It Does

Given a `package.json` with:

```json
{
  "dependencies": {
    "lodash": "^4.17.0",
    "express": "~4.18.0"
  }
}
```

And a lock file that resolved `lodash` to `4.17.21` and `express` to `4.18.3`, the tool will update `package.json` to:

```json
{
  "dependencies": {
    "lodash": "4.17.21",
    "express": "4.18.3"
  }
}
```

## Features

- **Interactive prompts** — confirm before making changes, choose which dependency types to pin
- **No downgrades** — pins to the version currently in your lock file
- **`.npmrc` configuration** — optionally adds `save-exact=true` and `ignore-scripts=true`
- **Skips non-pinnable deps** — git refs, file links, workspace protocols, and branch aliases are left untouched
- **Preserves formatting** — detects and maintains your manifest file's indentation style

## Options

The tool runs interactively. You'll be prompted to:

- **Select `.npmrc` options** (both checked by default):
  - `save-exact=true` — ensures future installs use exact versions
  - `ignore-scripts=true` — blocks post-install scripts (primary malware vector)
- **Choose dependency types** to pin:
  - `dependencies`, `devDependencies`, `optionalDependencies` (checked by default)
  - `peerDependencies` (unchecked by default — typically left as ranges)
  - For composer: `require` and `require-dev` (both checked by default)

## Requirements

- Node.js >= 18

## License

MIT
