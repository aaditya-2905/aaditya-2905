#!/usr/bin/env node
/**
 * Renders the profile stat cards into assets/.
 *
 * The README points only at files committed to this repo, so nothing is fetched
 * from a third-party image service when someone loads the profile. That matters:
 * GitHub proxies README images through Camo, which gives the upstream a few
 * seconds and then caches the failure — which is why shared card services flake.
 * Here the only network call happens in CI, and a failure just leaves the last
 * good SVG in place.
 *
 * Usage:
 *   GH_TOKEN=… GH_LOGIN=… node .github/scripts/generate-cards.mjs
 *   node .github/scripts/generate-cards.mjs --demo   # synthetic data, no token
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_DIR = resolve(ROOT, 'assets');

const DEMO = process.argv.includes('--demo');
const LOGIN = process.env.GH_LOGIN || 'aaditya-2905';
const TOKEN = process.env.GH_TOKEN;

if (!DEMO && !TOKEN) {
  console.error('GH_TOKEN is not set — the GitHub GraphQL API requires a token.');
  console.error('In CI the workflow supplies one; locally, try `--demo` to check layout only.');
  process.exit(1);
}

/* ── theme ──────────────────────────────────────────────────────────────────
 * Surface is the same navy the hero illustration sits on, so the cards read as
 * one system. The series ramp is the dataviz reference dark palette in its
 * documented slot order — it clears the lightness band, chroma floor, adjacent
 * CVD separation, normal-vision floor and 3:1 contrast against this surface.
 * The order is the colourblind-safety mechanism, so don't re-shuffle it.
 */
const T = {
  surface: '#0f1729',
  border:  '#263352',
  ink:     '#eef3fb',
  ink2:    '#9db0d4',
  muted:   '#6b7ea6',
  accent:  '#5ec8f5',
  empty:   '#1b2540',
  series:  ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300'],
  ramp:    ['#184f95', '#256abf', '#3987e5', '#6da7ec'], // sequential, low → high
};

const SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, 'JetBrains Mono', Menlo, Consolas, 'DejaVu Sans Mono', monospace";

/* ── helpers ─────────────────────────────────────────────────────────────── */

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

/** 1,284 · 12.9K · 4.2M — proportional figures, per the stat-tile contract. */
const compact = (n) => {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return n.toLocaleString('en-US');
};

/**
 * A rect with only the outer corners rounded — 4px rounded data-ends on the
 * ends of the stack, square where segments meet.
 */
const segPath = (x, y, w, h, r, roundLeft, roundRight) => {
  const rl = roundLeft ? Math.min(r, w / 2, h / 2) : 0;
  const rr = roundRight ? Math.min(r, w / 2, h / 2) : 0;
  return [
    `M ${x + rl} ${y}`,
    `H ${x + w - rr}`,
    rr && `A ${rr} ${rr} 0 0 1 ${x + w} ${y + rr}`,
    `V ${y + h - rr}`,
    rr && `A ${rr} ${rr} 0 0 1 ${x + w - rr} ${y + h}`,
    `H ${x + rl}`,
    rl && `A ${rl} ${rl} 0 0 1 ${x} ${y + h - rl}`,
    `V ${y + rl}`,
    rl && `A ${rl} ${rl} 0 0 1 ${x + rl} ${y}`,
    'Z',
  ].filter(Boolean).join(' ');
};

const card = (w, h, title, body) => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(title)}">
  <title>${esc(title)}</title>
  <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="14" fill="${T.surface}" stroke="${T.border}"/>
${body}
</svg>
`;

/** Section heading: a short accent rule, then the label. */
const heading = (x, y, text) => `  <rect x="${x}" y="${y - 10}" width="3" height="13" rx="1.5" fill="${T.accent}"/>
  <text x="${x + 11}" y="${y}" font-family="${MONO}" font-size="11.5" letter-spacing="1.6" fill="${T.ink2}">${esc(text)}</text>`;

/* ── data ────────────────────────────────────────────────────────────────── */

async function gql(query, variables = {}) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': `${LOGIN}-profile-cards`,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status} ${res.statusText}: ${await res.text()}`);
  const body = await res.json();
  if (body.errors) throw new Error(`GraphQL: ${body.errors.map((e) => e.message).join('; ')}`);
  return body.data;
}

const PROFILE_QUERY = `
  query ($login: String!) {
    user(login: $login) {
      createdAt
      followers { totalCount }
      pullRequests { totalCount }
      issues { totalCount }
      repositories(first: 100, ownerAffiliations: OWNER, isFork: false, orderBy: { field: STARGAZERS, direction: DESC }) {
        totalCount
        nodes {
          stargazerCount
          languages(first: 12, orderBy: { field: SIZE, direction: DESC }) {
            edges { size node { name } }
          }
        }
      }
    }
  }`;

const CONTRIB_QUERY = `
  query ($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        totalCommitContributions
        restrictedContributionsCount
        contributionCalendar {
          totalContributions
          weeks { contributionDays { date contributionCount } }
        }
      }
    }
  }`;

async function collect() {
  const { user } = await gql(PROFILE_QUERY, { login: LOGIN });

  const repos = user.repositories.nodes;
  const stars = repos.reduce((sum, r) => sum + r.stargazerCount, 0);

  const byLanguage = new Map();
  for (const repo of repos) {
    for (const { size, node } of repo.languages.edges) {
      byLanguage.set(node.name, (byLanguage.get(node.name) || 0) + size);
    }
  }

  // The contribution calendar caps at one year per query, so walk year by year
  // from account creation — that's what makes the all-time streak accurate.
  const startYear = new Date(user.createdAt).getUTCFullYear();
  const now = new Date();
  const days = [];
  let commits = 0;
  let contributions = 0;
  let restricted = 0;

  for (let year = startYear; year <= now.getUTCFullYear(); year++) {
    const from = new Date(Date.UTC(year, 0, 1)).toISOString();
    const to = new Date(Math.min(Date.UTC(year, 11, 31, 23, 59, 59), now.getTime())).toISOString();
    const { user: u } = await gql(CONTRIB_QUERY, { login: LOGIN, from, to });
    const c = u.contributionsCollection;
    commits += c.totalCommitContributions;
    contributions += c.contributionCalendar.totalContributions;
    restricted += c.restrictedContributionsCount;
    for (const week of c.contributionCalendar.weeks) {
      for (const d of week.contributionDays) days.push({ date: d.date, count: d.contributionCount });
    }
  }

  days.sort((a, b) => a.date.localeCompare(b.date));

  /* Private work lands in totalCommitContributions and in the calendar as soon
   * as the token may read it, so it needs no special handling here.
   * restrictedContributionsCount is the opposite signal: it only counts
   * contributions this token is NOT allowed to see the detail of. Non-zero means
   * private contributions are missing from the cards — and since it lumps
   * commits, issues and PRs together, it can't be added to the commit count to
   * make up the difference. Say so rather than quietly under-reporting. */
  if (restricted > 0) {
    console.warn(`\n  ⚠  ${restricted} contribution(s) sit in private repos this token cannot read,`);
    console.warn('     so they are missing from these cards. To include them:');
    console.warn('       1. create a PAT with the read:user scope, add it as the METRICS_TOKEN secret');
    console.warn('       2. enable Settings → Public profile → "Include private contributions on my profile"\n');
  }

  return {
    login: LOGIN,
    stars,
    commits,
    contributions,
    repos: user.repositories.totalCount,
    followers: user.followers.totalCount,
    pullRequests: user.pullRequests.totalCount,
    issues: user.issues.totalCount,
    languages: [...byLanguage.entries()].map(([name, size]) => ({ name, size })).sort((a, b) => b.size - a.size),
    days,
  };
}

function demoData() {
  const days = [];
  const today = new Date();
  for (let i = 370; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const weekday = d.getUTCDay();
    const base = weekday === 0 || weekday === 6 ? 0.35 : 0.8;
    const count = Math.random() < base ? Math.floor(Math.random() * 9) : 0;
    days.push({ date: d.toISOString().slice(0, 10), count });
  }
  return {
    login: LOGIN,
    stars: 42,
    commits: 1284,
    contributions: days.reduce((s, d) => s + d.count, 0),
    repos: 17,
    followers: 63,
    pullRequests: 88,
    issues: 24,
    languages: [
      { name: 'HCL', size: 412000 },
      { name: 'Python', size: 305000 },
      { name: 'JavaScript', size: 244000 },
      { name: 'Shell', size: 151000 },
      { name: 'Dockerfile', size: 62000 },
      { name: 'Go', size: 40000 },
      { name: 'CSS', size: 22000 },
    ],
    days,
  };
}

function streaks(days) {
  let longest = 0;
  let run = 0;
  for (const d of days) {
    if (d.count > 0) {
      run += 1;
      if (run > longest) longest = run;
    } else {
      run = 0;
    }
  }
  let current = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].count > 0) current += 1;
    else if (i === days.length - 1) continue; // today isn't over yet
    else break;
  }
  return { current, longest };
}

/* ── cards ───────────────────────────────────────────────────────────────── */

function statsCard(d) {
  const W = 480;
  const H = 212;
  const tiles = [
    ['contributions', compact(d.contributions)],
    ['commits', compact(d.commits)],
    ['stars earned', compact(d.stars)],
    ['pull requests', compact(d.pullRequests)],
    ['repositories', compact(d.repos)],
    ['followers', compact(d.followers)],
  ];

  const cols = [26, 178, 330];
  const rows = [108, 176];
  const body = tiles
    .map(([label, value], i) => {
      const x = cols[i % 3];
      const y = rows[Math.floor(i / 3)];
      return `  <text x="${x}" y="${y}" font-family="${SANS}" font-size="29" font-weight="600" fill="${T.ink}">${esc(value)}</text>
  <text x="${x}" y="${y + 19}" font-family="${MONO}" font-size="10.5" letter-spacing="0.7" fill="${T.muted}">${esc(label)}</text>`;
    })
    .join('\n');

  return card(
    W, H,
    `GitHub metrics for ${d.login}`,
    `${heading(26, 42, 'github metrics')}
  <text x="${W - 26}" y="42" text-anchor="end" font-family="${MONO}" font-size="10.5" fill="${T.muted}">@${esc(d.login)}</text>
  <line x1="26" y1="62" x2="${W - 26}" y2="62" stroke="${T.border}"/>
${body}`
  );
}

function languagesCard(d) {
  const W = 480;
  const H = 212;
  const PAD = 26;
  const BAR_W = W - PAD * 2;
  const BAR_H = 14;
  const BAR_Y = 78;
  const GAP = 2; // surface gap — white doing the separating, never a stroke

  // Six validated slots; everything past that folds into "Other" rather than
  // inventing a seventh hue.
  const top = d.languages.slice(0, 5);
  const restSize = d.languages.slice(5).reduce((s, l) => s + l.size, 0);
  const shown = restSize > 0 ? [...top, { name: 'Other', size: restSize }] : top;
  const total = shown.reduce((s, l) => s + l.size, 0) || 1;

  const withPct = shown.map((l, i) => ({ ...l, pct: (l.size / total) * 100, color: T.series[i] }));

  let x = PAD;
  const segments = withPct
    .map((l, i) => {
      const raw = (l.size / total) * BAR_W;
      const w = Math.max(raw - (i < withPct.length - 1 ? GAP : 0), 1.5);
      const path = segPath(x, BAR_Y, w, BAR_H, 4, i === 0, i === withPct.length - 1);
      x += raw;
      return `  <path d="${path}" fill="${l.color}"/>`;
    })
    .join('\n');

  // Legend is the dependable identity channel, and each row is directly
  // labelled with its share so nothing is gated behind a tooltip a static
  // image can't have.
  const legend = withPct
    .map((l, i) => {
      const lx = PAD + (i % 2) * 218;
      const ly = 126 + Math.floor(i / 2) * 27;
      return `  <circle cx="${lx + 4}" cy="${ly - 4}" r="4.5" fill="${l.color}"/>
  <text x="${lx + 16}" y="${ly}" font-family="${MONO}" font-size="11.5" fill="${T.ink}">${esc(l.name)}</text>
  <text x="${lx + 196}" y="${ly}" text-anchor="end" font-family="${MONO}" font-size="11.5" fill="${T.ink2}">${l.pct.toFixed(1)}%</text>`;
    })
    .join('\n');

  return card(
    W, H,
    `Most used languages by ${d.login}`,
    `${heading(PAD, 42, 'language mix')}
  <text x="${W - PAD}" y="42" text-anchor="end" font-family="${MONO}" font-size="10.5" fill="${T.muted}">by bytes</text>
  <line x1="${PAD}" y1="62" x2="${W - PAD}" y2="62" stroke="${T.border}"/>
${segments}
${legend}`
  );
}

function activityCard(d) {
  const W = 980;
  const H = 212; // 7 rows of cells end at y=169; the key needs clear air below
  const PAD = 26;
  const CELL = 11;
  const GAP = 3;
  const STEP = CELL + GAP;
  const WEEKS = 52;
  const GRID_Y = 74;

  const { current, longest } = streaks(d.days);

  // Bucket the trailing year into whole weeks starting on Sunday.
  const recent = d.days.slice(-(WEEKS * 7 + 7));
  const weeks = [];
  let week = new Array(7).fill(null);
  for (const day of recent) {
    const weekday = new Date(`${day.date}T00:00:00Z`).getUTCDay();
    week[weekday] = day;
    if (weekday === 6) {
      weeks.push(week);
      week = new Array(7).fill(null);
    }
  }
  if (week.some(Boolean)) weeks.push(week);
  const grid = weeks.slice(-WEEKS);

  const peak = Math.max(1, ...grid.flat().filter(Boolean).map((c) => c.count));
  const level = (n) => (n <= 0 ? -1 : Math.min(T.ramp.length - 1, Math.floor(((n - 1) / peak) * T.ramp.length)));

  const cells = grid
    .flatMap((wk, wi) =>
      wk.map((day, di) => {
        if (!day) return '';
        const lv = level(day.count);
        const fill = lv < 0 ? T.empty : T.ramp[lv];
        return `  <rect x="${PAD + wi * STEP}" y="${GRID_Y + di * STEP}" width="${CELL}" height="${CELL}" rx="2.5" fill="${fill}"/>`;
      })
    )
    .filter(Boolean)
    .join('\n');

  // One label per month, at the week where the month first appears.
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let lastMonth = -1;
  const monthLabels = grid
    .map((wk, wi) => {
      const first = wk.find(Boolean);
      if (!first) return '';
      const m = new Date(`${first.date}T00:00:00Z`).getUTCMonth();
      if (m === lastMonth) return '';
      lastMonth = m;
      return `  <text x="${PAD + wi * STEP}" y="${GRID_Y - 9}" font-family="${MONO}" font-size="9.5" fill="${T.muted}">${MONTHS[m]}</text>`;
    })
    .filter(Boolean)
    .join('\n');

  const gridRight = PAD + grid.length * STEP;
  const figures = [
    ['current streak', `${current}`, current === 1 ? 'day' : 'days'],
    ['longest streak', `${longest}`, longest === 1 ? 'day' : 'days'],
  ]
    .map(([label, value, unit], i) => {
      const x = gridRight + 34;
      const y = GRID_Y + 22 + i * 62;
      return `  <text x="${x}" y="${y}" font-family="${SANS}" font-size="27" font-weight="600" fill="${T.ink}">${value}<tspan font-size="13" font-weight="500" fill="${T.ink2}" dx="6">${unit}</tspan></text>
  <text x="${x}" y="${y + 18}" font-family="${MONO}" font-size="10.5" letter-spacing="0.7" fill="${T.muted}">${label}</text>`;
    })
    .join('\n');

  const key = T.ramp
    .map((c, i) => `  <rect x="${PAD + 44 + i * 15}" y="${H - 30}" width="11" height="11" rx="2.5" fill="${c}"/>`)
    .join('\n');

  return card(
    W, H,
    `Contribution activity for ${d.login} over the last year`,
    `${heading(PAD, 42, 'contribution activity')}
  <text x="${W - PAD}" y="42" text-anchor="end" font-family="${MONO}" font-size="10.5" fill="${T.muted}">${compact(d.contributions)} contributions all time</text>
  <line x1="${PAD}" y1="56" x2="${W - PAD}" y2="56" stroke="${T.border}"/>
${monthLabels}
${cells}
  <rect x="${PAD}" y="${H - 30}" width="11" height="11" rx="2.5" fill="${T.empty}"/>
  <text x="${PAD + 18}" y="${H - 21}" font-family="${MONO}" font-size="9.5" fill="${T.muted}">less</text>
${key}
  <text x="${PAD + 44 + T.ramp.length * 15 + 7}" y="${H - 21}" font-family="${MONO}" font-size="9.5" fill="${T.muted}">more</text>
  <line x1="${gridRight + 14}" y1="${GRID_Y}" x2="${gridRight + 14}" y2="${GRID_Y + 7 * STEP - GAP}" stroke="${T.border}"/>
${figures}`
  );
}

/* ── tech stack ──────────────────────────────────────────────────────────────
 * Icons come from devicon, but they are baked into a single committed SVG at
 * build time rather than hot-linked. Note that shields.io can no longer render
 * an AWS logo at all — Simple Icons dropped every Amazon mark over trademark,
 * so `logo=amazonaws` silently returns a text-only badge. devicon still has one.
 */
const DEVICON = 'https://raw.githubusercontent.com/devicons/devicon/master/icons';

const STACK = [
  { name: 'AWS', icon: 'amazonwebservices/amazonwebservices-original-wordmark' },
  { name: 'Terraform', icon: 'terraform/terraform-original' },
  { name: 'Kubernetes', icon: 'kubernetes/kubernetes-original' },
  { name: 'Docker', icon: 'docker/docker-original' },
  { name: 'Jenkins', icon: 'jenkins/jenkins-original' },
  { name: 'GitLab', icon: 'gitlab/gitlab-original' },
  { name: 'Ansible', icon: 'ansible/ansible-original' },
  // linux-plain, not linux-original: the full-colour Tux is a 189 KB traced
  // bitmap and would be ~75% of this card's weight on its own.
  { name: 'Linux', icon: 'linux/linux-plain' },
  { name: 'Prometheus', icon: 'prometheus/prometheus-original' },
  { name: 'Grafana', icon: 'grafana/grafana-original' },
  { name: 'NGINX', icon: 'nginx/nginx-original' },
  { name: 'Git', icon: 'git/git-original' },
  { name: 'Python', icon: 'python/python-original' },
  { name: 'Node.js', icon: 'nodejs/nodejs-original' },
  { name: 'Bash', icon: 'bash/bash-original' },
];

/**
 * Inline a devicon as a nested <svg>, keeping its own viewBox. Ids get a
 * per-icon prefix first: several devicons declare `id="a"`, and ids are global
 * to the containing document, so without this the gradients cross-wire.
 */
function embedIcon(markup, prefix, x, y, w, h) {
  const svg = markup
    .replace(/<\?xml[\s\S]*?\?>/g, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();

  const open = /<svg\b[^>]*>/i.exec(svg);
  if (!open) throw new Error(`${prefix}: no <svg> root element`);
  const viewBox = /viewBox\s*=\s*["']([^"']+)["']/i.exec(open[0])?.[1] ?? '0 0 128 128';
  const inner = svg.slice(open.index + open[0].length, svg.lastIndexOf('</svg>'));

  let scoped = inner;
  const ids = new Set([...inner.matchAll(/\sid\s*=\s*["']([^"']+)["']/g)].map((m) => m[1]));
  for (const id of ids) {
    const safe = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    scoped = scoped
      .replace(new RegExp(`(\\sid\\s*=\\s*["'])${safe}(["'])`, 'g'), `$1${prefix}-${id}$2`)
      .replace(new RegExp(`url\\(\\s*#${safe}\\s*\\)`, 'g'), `url(#${prefix}-${id})`)
      .replace(new RegExp(`((?:xlink:)?href\\s*=\\s*["'])#${safe}(["'])`, 'g'), `$1#${prefix}-${id}$2`);
  }

  return `  <svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet">${scoped}</svg>`;
}

async function stackCard() {
  const W = 980;
  const PAD = 26;
  const COLS = 8;
  const CELL = (W - PAD * 2) / COLS;
  const ROWS = Math.ceil(STACK.length / COLS);
  const H = 84 + (ROWS - 1) * 78 + 58 + 20;

  const fetched = await Promise.all(
    STACK.map(async (tech) => {
      const res = await fetch(`${DEVICON}/${tech.icon}.svg`, { headers: { 'User-Agent': `${LOGIN}-profile-cards` } });
      if (!res.ok) throw new Error(`devicon ${tech.icon}: ${res.status} ${res.statusText}`);
      return { ...tech, markup: await res.text() };
    })
  );

  const items = fetched
    .map((tech, i) => {
      const row = Math.floor(i / COLS);
      const inRow = Math.min(COLS, STACK.length - row * COLS);
      const offset = ((COLS - inRow) * CELL) / 2; // centre a short final row
      const cx = PAD + offset + (i % COLS) * CELL + CELL / 2;
      const y = 84 + row * 78;
      // Light chip: several brand marks (AWS, Bash, Ansible) are near-black and
      // would vanish into the navy surface without one.
      return `  <rect x="${cx - 33}" y="${y - 7}" width="66" height="50" rx="13" fill="#eef3fa"/>
${embedIcon(tech.markup, `ic${i}`, cx - 28, y, 56, 36)}
  <text x="${cx}" y="${y + 54}" text-anchor="middle" font-family="${MONO}" font-size="10.5" fill="${T.ink2}">${esc(tech.name)}</text>`;
    })
    .join('\n');

  return card(
    W, H,
    'Tech stack',
    `${heading(PAD, 42, 'tech stack')}
  <text x="${W - PAD}" y="42" text-anchor="end" font-family="${MONO}" font-size="10.5" fill="${T.muted}">day to day</text>
  <line x1="${PAD}" y1="62" x2="${W - PAD}" y2="62" stroke="${T.border}"/>
${items}`
  );
}

/* ── main ────────────────────────────────────────────────────────────────── */

const data = DEMO ? demoData() : await collect();

if (DEMO) {
  console.warn('\n  ⚠  --demo writes SYNTHETIC numbers, for checking layout only.');
  console.warn('     Do not commit the data cards produced by this mode.\n');
}

mkdirSync(OUT_DIR, { recursive: true });
const cards = {
  'card-stats.svg': statsCard(data),
  'card-languages.svg': languagesCard(data),
  'card-activity.svg': activityCard(data),
  'card-stack.svg': await stackCard(),
};
for (const [name, svg] of Object.entries(cards)) {
  writeFileSync(resolve(OUT_DIR, name), svg);
  console.log(`wrote assets/${name}`);
}
