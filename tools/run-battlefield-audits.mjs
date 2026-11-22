import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const groups = {
  ai: [
    ['village-squads', 'ai-audit', 'village', '120', '12345'],
    ['verdun-reactions', 'reaction-audit', '120', '91821', '--perf'],
  ],
  maps: [
    ['village-routes', 'village-outdoor-audit'],
    ['village-destruction', 'village-audit'],
    ['lighthouse', 'headland-audit'],
    ['verdun-relay', 'verdun-relay-audit'],
  ],
  performance: [
    ['trenches-battle', 'performance-battle', 'trenches'],
    ['verdun-battle', 'performance-battle', 'verdun'],
    ['trench-terrain', 'performance-terrain'],
    ['trench-terrain-cached', 'performance-terrain', '--cached'],
    ['verdun-scenery', 'performance-scenery'],
  ],
};
const group = process.argv[2];
if (!Object.hasOwn(groups, group)) throw Error('Usage: node tools/run-battlefield-audits.mjs <ai|maps|performance>');

const output = resolve('playtest-artifacts', `audit-${group}`);
mkdirSync(output, { recursive: true });
const bundles = mkdtempSync(join(output, 'bundles-'));
const bundler = resolve('node_modules/.bin/esbuild');
const results = [];
try {
  for (const [label, script, ...args] of groups[group]) {
    const outfile = join(bundles, `${script}.mjs`);
    const bundle = spawnSync(bundler, [`tools/${script}.ts`, '--bundle', '--platform=node', '--format=esm', '--packages=external', `--outfile=${outfile}`], { encoding: 'utf8' });
    const run = bundle.status === 0 ? spawnSync(process.execPath, [outfile, ...args], { encoding: 'utf8' }) : bundle;
    const { status, signal, stdout, stderr, error } = run;
    const reportPath = join(output, `${label}.json`), logPath = join(output, `${label}.log`);
    if (stdout) writeFileSync(reportPath, stdout);
    else rmSync(reportPath, { force: true });
    if (status !== 0 || stderr) writeFileSync(logPath, stderr || String(error ?? signal ?? `Exit ${status}`));
    else rmSync(logPath, { force: true });
    results.push({ label, script, args, passed: status === 0 });
    console.log(`${status === 0 ? 'PASS' : 'FAIL'} ${label}`);
  }
} finally {
  rmSync(bundles, { recursive: true, force: true });
  writeFileSync(join(output, 'summary.json'), JSON.stringify({ revision: process.env.GITHUB_SHA ?? 'local', node: process.version, group, results }, null, 2));
}
if (results.some(result => !result.passed)) process.exitCode = 1;
