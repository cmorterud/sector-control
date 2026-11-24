import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdtemp, mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';

const script = fileURLToPath(new URL('./visual-comparison.mjs', import.meta.url));
async function compare(before, after) {
  const root = await mkdtemp(join(tmpdir(), 'sector-compare-test-'));
  try {
    for (const [label, images] of [['before', before], ['after', after]]) {
      await mkdir(join(root, label));
      await writeFile(join(root, label, 'report.json'), JSON.stringify({source: (label === 'before' ? 'a' : 'b').repeat(40)}));
      for (const name of images) await writeFile(join(root, label, name), 'png');
    }
    await promisify(execFile)(process.execPath, [script, root]);
    return await readFile(join(root, 'index.html'), 'utf8');
  } finally { await rm(root, {recursive: true, force: true}); }
}
const shared = ['overview-intact.png', 'first-person.png'];

test('pairs shared viewpoints and shows added or removed ones alone', async () => {
  const html = await compare([...shared, 'detail-old-view.png'], [...shared, 'detail-firing-step.png', 'detail-yard.png']);
  assert.equal(html.split('<section>').length - 1, 5);
  for (const name of shared) { assert.ok(html.includes(`before/${name}`)); assert.ok(html.includes(`after/${name}`)); }
  assert.match(html, /firing step <small>new viewpoint, no base image<\/small>/);
  assert.ok(html.includes('after/detail-firing-step.png') && !html.includes('before/detail-firing-step.png'));
  assert.match(html, /old view <small>viewpoint removed by this change<\/small>/);
  assert.ok(html.includes('before/detail-old-view.png') && !html.includes('after/detail-old-view.png'));
  assert.ok(html.includes('aaaaaaa') && html.includes('bbbbbbb'));
});

test('still refuses a comparison missing a shared viewpoint, and ignores unrelated files', async () => {
  await assert.rejects(compare(['overview-intact.png'], shared), /shared viewpoints/);
  const html = await compare([...shared, 'failure.png', 'boundary-warning.png'], shared);
  assert.equal(html.split('<section>').length - 1, 2);
});
