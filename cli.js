#!/usr/bin/env node
'use strict';

const path = require('path');
const { generate, suggestBump } = require('./src/index');

const args = process.argv.slice(2);

function usage() {
  console.log(`
changelog-gen — Generate changelogs from conventional commits.

Usage:
  changelog-gen [options]

Options:
  --from <ref>        Start ref (default: latest git tag)
  --to <ref>          End ref (default: HEAD)
  --version <ver>     Version header (e.g. "1.2.0")
  --title <text>      Changelog title (default: "Changelog")
  --scopes            Group by scope within each type
  --bump-only         Only print the suggested semver bump
  --json              Output as JSON
  --cwd <dir>         Working directory (default: .)
  -h, --help          Show this help

Examples:
  changelog-gen
  changelog-gen --from v1.0.0 --version 1.1.0
  changelog-gen --bump-only
  changelog-gen --scopes --json
`);
}

let from, to = 'HEAD', version, title, scopes = false, bumpOnly = false, json = false, cwd = process.cwd();

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--from': from = args[++i]; break;
    case '--to': to = args[++i]; break;
    case '--version': version = args[++i]; break;
    case '--title': title = args[++i]; break;
    case '--scopes': scopes = true; break;
    case '--bump-only': bumpOnly = true; break;
    case '--json': json = true; break;
    case '--cwd': cwd = path.resolve(args[++i]); break;
    case '-h': case '--help': usage(); process.exit(0);
  }
}

try {
  const result = generate({ from, to, version, title, scopes, cwd });

  if (bumpOnly) {
    console.log(result.bump);
  } else if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(result.markdown);
    if (result.commits.length > 0) {
      console.log(`<!-- ${result.conventionalCommits} conventional commits out of ${result.totalCommits} total. Suggested bump: ${result.bump} -->`);
    }
  }
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
