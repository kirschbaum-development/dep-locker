# dependency-pinner

Pin dependency versions to their lock file resolutions for supply-chain security.

Supply-chain attacks on npm and Composer packages are increasingly common — malware gets injected as new versions of popular libraries. Pinning exact versions prevents automatic adoption of compromised releases.

## Usage

Run in your project root:

```bash
npx dependency-pinner
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
