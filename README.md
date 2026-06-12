# changelog-gen

Generate changelogs from [conventional commits](https://www.conventionalcommits.org/). Zero dependencies.

## Why

You write conventional commits. Your changelog should write itself.

Most changelog generators pull in 50+ dependencies or require complex config. This one just works — point it at your git history and get a clean markdown changelog.

## Install

```bash
npm install -g changelog-gen
```

Or use without installing:

```bash
npx changelog-gen
```

## Usage

### CLI

```bash
# Generate from latest tag to HEAD
changelog-gen

# Specify range and version
changelog-gen --from v1.0.0 --version 1.1.0

# Only show suggested semver bump
changelog-gen --bump-only
# → minor

# Group by scope
changelog-gen --scopes

# JSON output
changelog-gen --json
```

### Programmatic

```js
const { generate, parseCommit, suggestBump } = require('changelog-gen');

// Full pipeline
const result = generate({ from: 'v1.0.0', version: '1.1.0' });
console.log(result.markdown);
console.log('Suggested bump:', result.bump);

// Parse individual commits
const commit = parseCommit('feat(ui): add dark mode\n\nBREAKING CHANGE: old theme removed');
// → { type: 'feat', scope: 'ui', subject: 'add dark mode', breaking: true, semver: 'major', ... }

// Suggest bump from parsed commits
const commits = [parseCommit('feat: new thing'), parseCommit('fix: bug')];
suggestBump(commits); // → 'minor'
```

## How It Works

1. Reads git log between two refs (default: latest tag → HEAD)
2. Parses [conventional commit](https://www.conventionalcommits.org/) messages
3. Groups by type (feat, fix, perf, etc.)
4. Generates clean markdown
5. Suggests semver bump based on changes

## Commit Types & Semver

| Type | Section | Bump |
|------|---------|------|
| `feat` | Features | minor |
| `fix` | Bug Fixes | patch |
| `perf` | Performance | patch |
| `refactor` | Refactor | patch |
| `revert` | Reverts | patch |
| `build` | Build | patch |
| `docs` | Documentation | — |
| `style` | Style | — |
| `test` | Tests | — |
| `ci` | CI | — |
| `chore` | Chores | — |

Any commit with `!` or `BREAKING CHANGE:` in the body triggers a **major** bump.

## Output Example

```markdown
## 1.2.0 (2025-06-13)

### Features

- a1b2c3d **api**: add user endpoints
- e4f5g6h add search functionality

### Bug Fixes

- i7j8k9l fix memory leak in cache

### Performance

- m0n1o2p optimize database queries
```

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `--from <ref>` | Start ref | latest git tag |
| `--to <ref>` | End ref | HEAD |
| `--version <ver>` | Version in header | — |
| `--title <text>` | Title when no version | "Changelog" |
| `--scopes` | Group by scope within type | false |
| `--bump-only` | Print only the semver bump | false |
| `--json` | Output as JSON | false |
| `--cwd <dir>` | Working directory | `.` |

## License

MIT
