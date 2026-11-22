import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.argv[2];
if (!root) throw Error('Usage: node tools/visual-comparison.mjs <folder containing before/ and after/>');
const [before, after] = await Promise.all(['before', 'after'].map(async label => {
  const folder = join(root, label);
  const report = JSON.parse(await readFile(join(folder, 'report.json'), 'utf8'));
  const images = (await readdir(folder)).filter(name => /^(overview-intact|first-person|detail-[a-z-]+)\.png$/.test(name));
  return { label, source: /^[a-f0-9]{40}$/.test(report.source) ? report.source.slice(0, 7) : 'local', images };
}));
const images = before.images.filter(name => after.images.includes(name));
if (!images.includes('overview-intact.png') || !images.includes('first-person.png') ||
    images.length !== before.images.length || images.length !== after.images.length) throw Error('The revisions did not capture matching viewpoints');

const sections = images.map(name => `<section><h2>${name.slice(0, -4).replaceAll('-', ' ')}</h2><div class="pair">${[before, after].map(({ label, source }) =>
  `<figure><figcaption>${label === 'before' ? 'Base' : 'Proposed merge'} · ${source}</figcaption><img src="${label}/${name}" alt="${label} ${name}"></figure>`).join('')}</div></section>`);
await writeFile(join(root, 'index.html'), `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sector Control visual comparison</title>
<style>body{background:#181c1a;color:#edf0e7;font:16px system-ui;margin:2rem}.pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}figure{margin:0}figcaption{padding:.4rem 0}img{display:block;width:100%;height:auto}section{margin:2rem 0}h2{text-transform:capitalize}</style>
<h1>Sector Control visual comparison</h1>${sections.join('\n')}
</html>\n`);
