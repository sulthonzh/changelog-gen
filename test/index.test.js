#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  parseCommit,
  parseCommits,
  groupByType,
  suggestBump,
  formatCommitLine,
  generateMarkdown,
  generate,
  TYPES,
} = require('../src/index');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failed++;
    console.error(`FAIL: ${name}\n  ${err.message}`);
  }
}

// ── parseCommit ────────────────────────────────────────────────

test('parses feat commit', () => {
  const c = parseCommit('feat: add dark mode');
  assert.strictEqual(c.type, 'feat');
  assert.strictEqual(c.subject, 'add dark mode');
  assert.strictEqual(c.scope, null);
  assert.strictEqual(c.breaking, false);
  assert.strictEqual(c.semver, 'minor');
});

test('parses feat with scope', () => {
  const c = parseCommit('feat(ui): add sidebar');
  assert.strictEqual(c.type, 'feat');
  assert.strictEqual(c.scope, 'ui');
  assert.strictEqual(c.subject, 'add sidebar');
});

test('parses fix commit', () => {
  const c = parseCommit('fix: handle null pointer');
  assert.strictEqual(c.type, 'fix');
  assert.strictEqual(c.semver, 'patch');
});

test('parses breaking change with !', () => {
  const c = parseCommit('feat!: redesign API');
  assert.strictEqual(c.breaking, true);
  assert.strictEqual(c.semver, 'major');
});

test('parses breaking change with scope and !', () => {
  const c = parseCommit('feat(api)!: change response format');
  assert.strictEqual(c.scope, 'api');
  assert.strictEqual(c.breaking, true);
  assert.strictEqual(c.semver, 'major');
});

test('parses BREAKING CHANGE in body', () => {
  const c = parseCommit('feat: new thing\n\nBREAKING CHANGE: old thing is gone', 'abc123', '2025-01-01');
  assert.strictEqual(c.breaking, true);
  assert.strictEqual(c.breakingNote, 'old thing is gone');
  assert.strictEqual(c.semver, 'major');
});

test('parses BREAKING-CHANGE in body', () => {
  const c = parseCommit('feat: new thing\n\nBREAKING-CHANGE: removed old API');
  assert.strictEqual(c.breaking, true);
  assert.strictEqual(c.breakingNote, 'removed old API');
});

test('returns null for non-conventional commit', () => {
  assert.strictEqual(parseCommit('random commit message'), null);
});

test('returns null for unknown type', () => {
  assert.strictEqual(parseCommit('wibble: something'), null);
});

test('preserves hash and date', () => {
  const c = parseCommit('fix: bug', 'deadbeef1234', '2025-06-13');
  assert.strictEqual(c.hash, 'deadbeef1234');
  assert.strictEqual(c.date, '2025-06-13');
});

test('handles all known types', () => {
  for (const type of Object.keys(TYPES)) {
    const c = parseCommit(`${type}: test`);
    assert.ok(c, `Should parse type: ${type}`);
    assert.strictEqual(c.type, type);
  }
});

test('docs/style/test/ci/chore are non-semver by default', () => {
  for (const type of ['docs', 'style', 'test', 'ci', 'chore']) {
    const c = parseCommit(`${type}: something`);
    assert.strictEqual(c.semver, null, `${type} should be null semver`);
  }
});

// ── parseCommits ───────────────────────────────────────────────

test('parses array of commits', () => {
  const commits = [
    { message: 'feat: a thing', hash: 'aaa' },
    { message: 'fix: a bug', hash: 'bbb' },
    { message: 'random stuff', hash: 'ccc' },
  ];
  const parsed = parseCommits(commits);
  assert.strictEqual(parsed.length, 2);
  assert.strictEqual(parsed[0].type, 'feat');
  assert.strictEqual(parsed[1].type, 'fix');
});

test('returns empty for empty input', () => {
  assert.deepStrictEqual(parseCommits([]), []);
});

// ── groupByType ────────────────────────────────────────────────

test('groups commits by type', () => {
  const commits = [
    parseCommit('feat: one'),
    parseCommit('feat: two'),
    parseCommit('fix: a bug'),
  ];
  const groups = groupByType(commits);
  assert.strictEqual(groups.feat.length, 2);
  assert.strictEqual(groups.fix.length, 1);
});

// ── suggestBump ────────────────────────────────────────────────

test('suggests major for breaking change', () => {
  const commits = [parseCommit('feat!: big change'), parseCommit('fix: small fix')];
  assert.strictEqual(suggestBump(commits), 'major');
});

test('suggests minor for feat only', () => {
  const commits = [parseCommit('feat: new thing'), parseCommit('fix: a bug')];
  assert.strictEqual(suggestBump(commits), 'minor');
});

test('suggests patch for fixes only', () => {
  const commits = [parseCommit('fix: bug 1'), parseCommit('fix: bug 2')];
  assert.strictEqual(suggestBump(commits), 'patch');
});

test('suggests none for no semver changes', () => {
  const commits = [parseCommit('docs: update readme'), parseCommit('ci: fix pipeline')];
  assert.strictEqual(suggestBump(commits), 'none');
});

test('suggests none for empty commits', () => {
  assert.strictEqual(suggestBump([]), 'none');
});

// ── formatCommitLine ──────────────────────────────────────────

test('formats basic commit line', () => {
  const c = parseCommit('feat: add thing', 'abcdef1234567890');
  const line = formatCommitLine(c);
  assert.ok(line.includes('abcdef1'));
  assert.ok(line.includes('add thing'));
});

test('formats commit with scope', () => {
  const c = parseCommit('feat(ui): sidebar', 'abc123');
  const line = formatCommitLine(c);
  assert.ok(line.includes('**ui**:'));
});

test('formats breaking commit', () => {
  const c = parseCommit('feat!: big change', 'abc');
  const line = formatCommitLine(c);
  assert.ok(line.includes('BREAKING'));
});

test('formats commit without hash', () => {
  const c = parseCommit('fix: something');
  const line = formatCommitLine(c);
  assert.ok(line.startsWith('- '));
});

// ── generateMarkdown ──────────────────────────────────────────

test('generates markdown with version header', () => {
  const commits = [parseCommit('feat: new feature'), parseCommit('fix: a bug')];
  const md = generateMarkdown(commits, { version: '1.1.0', date: '2025-06-13' });
  assert.ok(md.includes('## 1.1.0 (2025-06-13)'));
  assert.ok(md.includes('### Features'));
  assert.ok(md.includes('### Bug Fixes'));
  assert.ok(md.includes('new feature'));
  assert.ok(md.includes('a bug'));
});

test('generates markdown with title when no version', () => {
  const commits = [parseCommit('feat: stuff')];
  const md = generateMarkdown(commits, { title: 'Unreleased' });
  assert.ok(md.includes('## Unreleased'));
});

test('uses today as default date', () => {
  const commits = [parseCommit('feat: stuff')];
  const today = new Date().toISOString().split('T')[0];
  const md = generateMarkdown(commits);
  assert.ok(md.includes(today));
});

test('groups by scope when scopes=true', () => {
  const commits = [
    parseCommit('feat(ui): sidebar'),
    parseCommit('feat(api): endpoint'),
    parseCommit('feat: general thing'),
  ];
  const md = generateMarkdown(commits, { scopes: true });
  assert.ok(md.includes('**ui:**'));
  assert.ok(md.includes('**api:**'));
});

test('includes BREAKING CHANGES section', () => {
  const commits = [parseCommit('feat!: big change\n\nBREAKING CHANGE: removed old thing')];
  const md = generateMarkdown(commits);
  assert.ok(md.includes('BREAKING CHANGES'));
  assert.ok(md.includes('removed old thing'));
});

test('skips empty types', () => {
  const commits = [parseCommit('feat: only this')];
  const md = generateMarkdown(commits);
  assert.ok(md.includes('### Features'));
  assert.ok(!md.includes('### Bug Fixes'));
});

test('respects custom order', () => {
  const commits = [parseCommit('fix: bug'), parseCommit('feat: feature')];
  const md = generateMarkdown(commits, { order: ['fix', 'feat'] });
  const fixIdx = md.indexOf('### Bug Fixes');
  const featIdx = md.indexOf('### Features');
  assert.ok(fixIdx < featIdx);
});

// ── generate (full pipeline) ──────────────────────────────────

test('generate returns result object', () => {
  // Run from the changelog-gen repo itself — may or may not have conventional commits
  const result = generate({ cwd: __dirname });
  assert.ok(typeof result.markdown === 'string');
  assert.ok(typeof result.bump === 'string');
  assert.ok(Array.isArray(result.commits));
  assert.ok(typeof result.totalCommits === 'number');
  assert.ok(typeof result.conventionalCommits === 'number');
});

// ── Results ────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed} tests`);
if (failed > 0) process.exit(1);
