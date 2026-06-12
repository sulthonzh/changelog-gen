'use strict';

const { execSync } = require('child_process');

// ── Conventional commit patterns ──────────────────────────────────
const TYPES = {
  feat: { title: 'Features', semver: 'minor' },
  fix: { title: 'Bug Fixes', semver: 'patch' },
  perf: { title: 'Performance', semver: 'patch' },
  refactor: { title: 'Refactor', semver: 'patch' },
  docs: { title: 'Documentation', semver: null },
  style: { title: 'Style', semver: null },
  test: { title: 'Tests', semver: null },
  build: { title: 'Build', semver: 'patch' },
  ci: { title: 'CI', semver: null },
  chore: { title: 'Chores', semver: null },
  revert: { title: 'Reverts', semver: 'patch' },
};

const COMMIT_RE = /^(\w+?)(?:\(([^)]*)\))?(!)?:\s*(.+)$/;
const BREAKING_RE = /BREAKING[ -]CHANGE:\s*(.+)/i;

/**
 * Parse a single commit message into structured data.
 */
function parseCommit(message, hash, date) {
  const lines = message.split('\n');
  const firstLine = lines[0];
  const body = lines.slice(1).join('\n');

  const match = firstLine.match(COMMIT_RE);
  if (!match) return null;

  const [, type, scope, bang, subject] = match;
  const breakingMark = bang === '!';
  const breakingMatch = body.match(BREAKING_RE);

  const info = TYPES[type];
  if (!info) return null;

  let semver = info.semver || null;
  if (breakingMark || breakingMatch) semver = 'major';

  return {
    type,
    scope: scope || null,
    subject: subject.trim(),
    breaking: breakingMark || !!breakingMatch,
    breakingNote: breakingMatch ? breakingMatch[1].trim() : null,
    semver,
    hash: hash || null,
    date: date || null,
    body: body.trim(),
  };
}

/**
 * Parse an array of raw commit lines [{ message, hash, date }].
 */
function parseCommits(commits) {
  const parsed = [];
  for (const c of commits) {
    const p = parseCommit(c.message, c.hash, c.date);
    if (p) parsed.push(p);
  }
  return parsed;
}

/**
 * Group commits by type.
 */
function groupByType(commits) {
  const groups = {};
  for (const c of commits) {
    if (!groups[c.type]) groups[c.type] = [];
    groups[c.type].push(c);
  }
  return groups;
}

/**
 * Determine the suggested semver bump from parsed commits.
 */
function suggestBump(commits) {
  let bump = null;
  for (const c of commits) {
    if (c.semver === 'major') return 'major';
    if (c.semver === 'minor') bump = 'minor';
    if (c.semver === 'patch' && !bump) bump = 'patch';
  }
  return bump || 'none';
}

/**
 * Format a single commit line for the changelog.
 */
function formatCommitLine(commit) {
  let line = '';
  if (commit.hash) line += `- ${commit.hash.slice(0, 7)} `;
  else line += '- ';

  if (commit.scope) line += `**${commit.scope}**: `;
  line += commit.subject;

  if (commit.breaking) line += ' **BREAKING**';
  return line;
}

/**
 * Generate a markdown changelog section from parsed commits.
 */
function generateMarkdown(commits, options = {}) {
  const {
    title = 'Changelog',
    version,
    date: optDate,
    order = ['feat', 'fix', 'perf', 'refactor', 'revert', 'docs', 'style', 'test', 'build', 'ci', 'chore'],
    scopes = false,
  } = options;

  const grouped = groupByType(commits);
  const lines = [];

  // Header
  const headerDate = optDate || new Date().toISOString().split('T')[0];
  if (version) {
    lines.push(`## ${version} (${headerDate})`);
  } else {
    lines.push(`## ${title} (${headerDate})`);
  }
  lines.push('');

  for (const type of order) {
    const commitsOfType = grouped[type];
    if (!commitsOfType || commitsOfType.length === 0) continue;

    const info = TYPES[type];
    lines.push(`### ${info.title}`);
    lines.push('');

    if (scopes) {
      // Group by scope within type
      const byScope = {};
      const noScope = [];
      for (const c of commitsOfType) {
        if (c.scope) {
          if (!byScope[c.scope]) byScope[c.scope] = [];
          byScope[c.scope].push(c);
        } else {
          noScope.push(c);
        }
      }
      for (const [scope, sc] of Object.entries(byScope)) {
        lines.push(`**${scope}:**`);
        for (const c of sc) lines.push(formatCommitLine(c));
        lines.push('');
      }
      if (noScope.length) {
        for (const c of noScope) lines.push(formatCommitLine(c));
        lines.push('');
      }
    } else {
      for (const c of commitsOfType) lines.push(formatCommitLine(c));
      lines.push('');
    }

    // Breaking changes section
    const breakingCommits = commitsOfType.filter(c => c.breaking && c.breakingNote);
    if (breakingCommits.length) {
      lines.push('**BREAKING CHANGES:**');
      for (const c of breakingCommits) {
        lines.push(`- ${c.breakingNote}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n').trim() + '\n';
}

/**
 * Get git log commits between two refs.
 */
function getGitLog(from, to = 'HEAD', options = {}) {
  const { cwd = process.cwd() } = options;
  const separator = '---COMMIT_SEP---';
  const format = ['%H', '%s%n%b', '%aI'].join(separator);
  const range = from ? `${from}..${to}` : to;

  let raw;
  try {
    raw = execSync(`git log --format="${format}" ${range}`, {
      encoding: 'utf-8',
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    return [];
  }

  const entries = raw.split(`\n${separator}`);
  // Actually split differently — the format wraps with separator
  // Let's re-parse properly
  const commits = [];
  const blocks = raw.split(new RegExp(`\\n(?=[0-9a-f]{40}${escapeRe(separator)})`));

  // Simpler approach: use a null-byte separator
  return getGitLogSimple(from, to, cwd);
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getGitLogSimple(from, to, cwd) {
  let raw;
  try {
    raw = execSync(
      `git log --format="%H%x00%s%x00%b%x00%aI" ${from ? from + '..' : ''}${to}`,
      { encoding: 'utf-8', cwd, stdio: ['pipe', 'pipe', 'pipe'] }
    );
  } catch {
    return [];
  }

  const commits = [];
  const lines = raw.trim().split('\n');

  for (const line of lines) {
    const parts = line.split('\0');
    if (parts.length < 3) continue;
    const hash = parts[0];
    const subject = parts[1];
    const body = parts[2] || '';
    const date = parts[3] || '';
    commits.push({ message: (subject + '\n' + body).trim(), hash, date });
  }

  return commits;
}

/**
 * Get the latest git tag.
 */
function getLatestTag(cwd = process.cwd()) {
  try {
    return execSync('git describe --tags --abbrev=0', {
      encoding: 'utf-8',
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Full pipeline: read git log, parse, generate changelog.
 */
function generate(options = {}) {
  const {
    from,
    to = 'HEAD',
    cwd = process.cwd(),
    version,
    title,
    scopes = false,
    order,
  } = options;

  const fromRef = from || getLatestTag(cwd);
  const rawCommits = getGitLogSimple(fromRef, to, cwd);
  const parsed = parseCommits(rawCommits);

  const markdown = generateMarkdown(parsed, { version, title, scopes, order });
  const bump = suggestBump(parsed);

  return {
    markdown,
    bump,
    commits: parsed,
    totalCommits: rawCommits.length,
    conventionalCommits: parsed.length,
    from: fromRef,
    to,
  };
}

module.exports = {
  parseCommit,
  parseCommits,
  groupByType,
  suggestBump,
  formatCommitLine,
  generateMarkdown,
  generate,
  getGitLog: getGitLogSimple,
  getLatestTag,
  TYPES,
};
