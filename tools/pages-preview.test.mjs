import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm, symlink, link} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {basePath, safePath, staticFiles, gitHash, stamp, validateBuild, isCurrentPR, replaceBuild, verifyPublished, readPublishedManifest, awaitPublishedManifest, resolveContext, stageSite, reportPreview} from './pages-preview.mjs';

const repository = 'cmorterud/sector-control', head = 'a'.repeat(40), source = 'b'.repeat(40);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const manifest = () => ({version: 1, repository, head, source, pr: 42, run: 123, attempt: 1,
  base: '/sector-control/pr-preview/pr-42/', files: {'index.html': hash('game')}});
const context = () => ({repository, head, pr: 42, run: 123, attempt: 1});
async function temporary(fn) {
  const root = await mkdtemp(join(tmpdir(), 'sector-pages-test-'));
  try {return await fn(root);} finally {await rm(root, {recursive: true, force: true});}
}

test('production and numbered previews get independent asset bases', () => {
  assert.equal(basePath(repository), '/sector-control/');
  assert.equal(basePath(repository, 42), '/sector-control/pr-preview/pr-42/');
  for (const pr of [-1, 0.5, '42', NaN]) assert.throws(() => basePath(repository, pr));
  assert.throws(() => basePath('owner/repo/../other', 42));
});

test('static paths reject traversal, credentials, executable hooks and hidden content', () => {
  for (const path of ['../index.html', '/index.html', 'assets/../../index.html', '.git/config', '.github/workflows/publish.yml',
    'assets/.env', 'a//b.js', 'assets\\file.js', 'https://evil.example/a.js', 'a.sh', 'a.js?x', 'a.js\nindex.html']) {
    assert.throws(() => safePath(path), path);
  }
  assert.equal(safePath('models/README.md'), 'models/README.md');
  assert.equal(safePath('assets/index-Abc_123.js'), 'assets/index-Abc_123.js');
  assert.equal(safePath('manifest.webmanifest'), 'manifest.webmanifest');
});

test('publishing a PR preserves production and sibling previews and deletes obsolete PR assets', () => {
  const existing = new Map([['index.html', 'production'], ['assets/main.js', 'main'],
    ['pr-preview/pr-42/index.html', 'old'], ['pr-preview/pr-42/assets/old.js', 'obsolete'], ['pr-preview/pr-43/index.html', 'sibling']]);
  const next = replaceBuild(existing, new Map([['index.html', 'new'], ['assets/new.js', 'new-js']]), 42);
  assert.equal(next.get('index.html'), 'production');
  assert.equal(next.get('assets/main.js'), 'main');
  assert.equal(next.get('pr-preview/pr-43/index.html'), 'sibling');
  assert.equal(next.get('pr-preview/pr-42/index.html'), 'new');
  assert.equal(next.has('pr-preview/pr-42/assets/old.js'), false);
  assert.equal(existing.get('pr-preview/pr-42/index.html'), 'old');
});

test('production replacement preserves every PR while dropping old production assets', () => {
  const existing = new Map([['index.html', 'old'], ['assets/old.js', 'obsolete'], ['pr-preview/pr-42/index.html', 'preview']]);
  const next = replaceBuild(existing, new Map([['index.html', 'new'], ['assets/main.js', 'new-js']]), 0);
  assert.equal(next.get('index.html'), 'new');
  assert.equal(next.has('assets/old.js'), false);
  assert.equal(next.get('pr-preview/pr-42/index.html'), 'preview');
});

test('a build cannot overwrite sibling previews or bootstrap a production-less site', () => {
  const existing = new Map([['index.html', 'production']]);
  assert.throws(() => replaceBuild(existing, new Map([['pr-preview/pr-43/index.html', 'bad']]), 42));
  assert.throws(() => replaceBuild(new Map(), new Map([['index.html', 'preview']]), 42));
});

test('only an open same-repository PR at the tested head targeting main is current', () => {
  const pr = {state: 'open', head: {sha: head, repo: {full_name: repository}}, base: {ref: 'main', repo: {full_name: repository}}};
  assert.equal(isCurrentPR(pr, repository, head), true);
  assert.equal(isCurrentPR({...pr, state: 'closed'}, repository, head), false);
  assert.equal(isCurrentPR(pr, repository, source), false);
  assert.equal(isCurrentPR({...pr, head: {...pr.head, repo: {full_name: 'someone/fork'}}}, repository, head), false);
  assert.equal(isCurrentPR({...pr, base: {...pr.base, ref: 'other'}}, repository, head), false);
  assert.equal(isCurrentPR({...pr, base: {...pr.base, repo: {full_name: 'someone/other'}}}, repository, head), false);
});

test('manifest must match the exact run, attempt, PR, repository, revision and base', () => {
  assert.doesNotThrow(() => validateBuild(manifest(), context()));
  for (const change of [{version: 2}, {head: source}, {repository: 'someone/fork'}, {pr: 43}, {run: 122}, {attempt: 2},
    {source: 'not-a-sha'}, {base: '/sector-control/'}, {files: {}}, {files: {'../index.html': hash('bad')}},
    {files: {'pr-preview/pr-43/index.html': hash('bad')}}, {files: {'revision.json': hash('bad')}}]) {
    assert.throws(() => validateBuild({...manifest(), ...change}, context()), JSON.stringify(change));
  }
});

test('static collection rejects symlinks, hard links and hidden empty directories', async () => {
  await temporary(async root => {
    await writeFile(join(root, 'index.html'), 'game');
    await symlink(join(root, 'index.html'), join(root, 'linked.html'));
    await assert.rejects(staticFiles(root), /regular static file/);
    await rm(join(root, 'linked.html'));
    await link(join(root, 'index.html'), join(root, 'linked.html'));
    await assert.rejects(staticFiles(root), /Linked/);
    await rm(join(root, 'linked.html'));
    await mkdir(join(root, '.github'));
    await assert.rejects(staticFiles(root), /Unsafe/);
  });
});

test('stamp records the tested merge SHA, PR head and hashes without executing JS', async () => {
  await temporary(async root => {
    await writeFile(join(root, 'index.html'), '<script src="/sector-control/pr-preview/pr-42/assets/main.js"></script>');
    await mkdir(join(root, 'assets'));
    await writeFile(join(root, 'assets/main.js'), 'throw Error("must never run in publisher")');
    const env = {GITHUB_EVENT_NAME: 'pull_request', GITHUB_REPOSITORY: repository, GITHUB_SHA: source,
      GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', PAGES_BASE_PATH: '/sector-control/pr-preview/pr-42/'};
    const result = await stamp(root, env, {number: 42, pull_request: {head: {sha: head}}});
    validateBuild(result, context());
    assert.equal(result.source, source);
    assert.equal(result.files['assets/main.js'], hash('throw Error("must never run in publisher")'));
    assert.equal(result.files['revision.json'], undefined);
    assert.deepEqual(JSON.parse(await readFile(join(root, 'revision.json'), 'utf8')), result);
    await assert.rejects(stamp(root, {...env, PAGES_BASE_PATH: '/sector-control/'}, {number: 42, pull_request: {head: {sha: head}}}));
  });
});

test('Git blob identity uses the Git header and content bytes', () => {
  assert.equal(gitHash(Buffer.from('hello\n')), 'ce013625030ba8dba906f756967f9e9ca394464a');
});

test('deployed verification rejects stale revisions and altered/missing assets', async () => {
  const original = process.env.GITHUB_REPOSITORY;
  process.env.GITHUB_REPOSITORY = repository;
  try {
    const base = 'https://example.com/sector-control/pr-preview/pr-42/';
    let calls = [];
    const fetcher = async url => {calls.push(url.href); return new Response(url.pathname.endsWith('revision.json') ? JSON.stringify(manifest()) : 'game');};
    await verifyPublished(base, head, 42, fetcher);
    assert.equal(calls[1], base + 'index.html');
    await assert.rejects(verifyPublished(base, source, 42, fetcher), /provenance/);
    await assert.rejects(verifyPublished(base, head, 43, fetcher), /provenance/);
    await verifyPublished(base, head, 42, fetcher, {run: 123, attempt: 1});
    await assert.rejects(verifyPublished(base, head, 42, fetcher, {run: 123, attempt: 2}), /provenance/);
    await assert.rejects(verifyPublished(base, head, 42, fetcher, {run: 122, attempt: 1}), /provenance/);
    await assert.rejects(readPublishedManifest(base, {head, source: head, run: 123, attempt: 1}, fetcher), /merge revision changed/);
    const altered = async url => new Response(url.pathname.endsWith('revision.json') ? JSON.stringify(manifest()) : 'changed');
    await assert.rejects(verifyPublished(base, head, 42, altered), /missing or stale/);
    await assert.rejects(verifyPublished(base, head, 42, async () => new Response('', {status: 404})), /HTTP 404/);
    await assert.rejects(verifyPublished('https://example.com/?redirect=evil', head, 42, fetcher), /Invalid verification/);
  } finally {
    if (original === undefined) delete process.env.GITHUB_REPOSITORY; else process.env.GITHUB_REPOSITORY = original;
  }
});

test('a completed browser replay cannot report after a newer publication at the same PR head', async () => {
  const oldFetch = globalThis.fetch;
  const settings = {GITHUB_REPOSITORY: repository, GITHUB_RUN_ID: '456', GH_TOKEN: 'fake-test-token',
    PAGES_SITE_URL: 'https://example.com/sector-control/', PREVIEW_PR: '42', PREVIEW_HEAD: head,
    PREVIEW_URL: 'https://example.com/sector-control/pr-preview/pr-42/', PREVIEW_CLEANUP: 'false',
    PREVIEW_STAGED: 'true', EXPECTED_CI_RUN: '123', EXPECTED_CI_ATTEMPT: '1', PUBLISH_RESULT: 'success', VERIFY_RESULT: 'success'};
  const oldEnv = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]]));
  Object.assign(process.env, settings);
  try {
    for (const attempt of [2, 1]) {
      const writes = [];
      globalThis.fetch = async (url, options) => {
        const path = String(url).split(`/repos/${repository}/`)[1];
        if (options.method !== 'GET') writes.push(JSON.parse(options.body));
        if (path === 'pulls/42') return Response.json({state: 'open', head: {sha: head, repo: {full_name: repository}}, base: {ref: 'main', repo: {full_name: repository}}});
        if (path === 'contents/pr-preview/pr-42/revision.json?ref=pages-content')
          return Response.json({encoding: 'base64', content: Buffer.from(JSON.stringify({...manifest(), attempt})).toString('base64')});
        if (path === `statuses/${head}`) return Response.json({});
        if (path.startsWith('issues/42/comments')) return Response.json([]);
        throw Error('Unexpected test request ' + path);
      };
      await reportPreview();
      assert.equal(writes.length, attempt === 2 ? 0 : 2);
      if (attempt === 1) assert.equal(writes[0].state, 'success');
    }
  } finally {
    globalThis.fetch = oldFetch;
    for (const [key, value] of Object.entries(oldEnv)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

test('trusted publisher carries production and siblings through a PR update, prunes closed PRs, and uses non-forced writes', async () => {
  await temporary(async root => {
    const cwd = process.cwd(), oldFetch = globalThis.fetch;
    const envKeys = ['GITHUB_REPOSITORY', 'GH_TOKEN', 'GITHUB_STEP_SUMMARY'];
    const env = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
    // PR 42's current build lists kept.js; old.js was already retained once from the build before it.
    const existing = new Map([['index.html', Buffer.from('production')], ['assets/main.js', Buffer.from('production JS')],
      ['pr-preview/pr-41/index.html', Buffer.from('closed preview')], ['pr-preview/pr-42/assets/old.js', Buffer.from('obsolete')],
      ['pr-preview/pr-42/assets/kept.js', Buffer.from('previous build JS')],
      ['pr-preview/pr-42/revision.json', Buffer.from(JSON.stringify({files: {'index.html': 'x', 'assets/kept.js': 'y'}}))],
      ['pr-preview/pr-43/index.html', Buffer.from('sibling')]]);
    const blobs = new Map([...existing.values()].map(bytes => [gitHash(bytes), bytes]));
    const writes = [];
    try {
      process.chdir(root); process.env.GITHUB_REPOSITORY = repository; process.env.GH_TOKEN = 'fake-test-token';
      process.env.GITHUB_STEP_SUMMARY = join(root, 'summary.md');
      await mkdir('playtest-artifacts/pages-incoming/assets', {recursive: true});
      await writeFile('playtest-artifacts/pages-incoming/index.html', '<script src="/sector-control/pr-preview/pr-42/assets/new.js"></script>');
      await writeFile('playtest-artifacts/pages-incoming/assets/new.js', 'throw Error("static data only")');
      const files = await staticFiles('playtest-artifacts/pages-incoming');
      const build = {...manifest(), files: Object.fromEntries([...files].map(([path, file]) => [path, hash(file.bytes)]))};
      await writeFile('playtest-artifacts/pages-incoming/revision.json', JSON.stringify(build));
      await writeFile('playtest-artifacts/pages-context.json', JSON.stringify({...context(), cleanup: false}));
      globalThis.fetch = async (url, options) => {
        const path = String(url).split(`/repos/${repository}/`)[1], body = options.body && JSON.parse(options.body);
        if (options.method !== 'GET') writes.push({path, method: options.method, body});
        let data;
        if (path === 'git/ref/heads/pages-content') data = {object: {sha: source}};
        else if (path === `git/commits/${source}`) data = {tree: {sha: head}};
        else if (path === `git/trees/${head}?recursive=1`) data = {truncated: false, tree: [...existing].map(([path, bytes]) => ({path, type: 'blob', mode: '100644', size: bytes.length, sha: gitHash(bytes)}))};
        else if (path.startsWith('pulls/')) data = {number: Number(path.split('/')[1]), state: path === 'pulls/41' ? 'closed' : 'open', head: {sha: head, repo: {full_name: repository}}, base: {ref: 'main', repo: {full_name: repository}}};
        else if (path.startsWith('git/blobs/')) data = {encoding: 'base64', content: blobs.get(path.slice('git/blobs/'.length)).toString('base64')};
        else if (path === 'git/blobs') data = {sha: gitHash(Buffer.from(body.content, 'base64'))};
        else if (path === 'git/trees' || path === 'git/commits') data = {sha: head};
        else if (path === 'git/refs/heads/pages-content') data = {};
        else throw Error(`Unexpected API request: ${options.method} ${path}`);
        return new Response(JSON.stringify(data));
      };
      await stageSite();
      assert.equal(await readFile('playtest-artifacts/pages-site/index.html', 'utf8'), 'production');
      assert.equal(await readFile('playtest-artifacts/pages-site/pr-preview/pr-43/index.html', 'utf8'), 'sibling');
      await assert.rejects(readFile('playtest-artifacts/pages-site/pr-preview/pr-41/index.html'), /ENOENT/);
      await assert.rejects(readFile('playtest-artifacts/pages-site/pr-preview/pr-42/assets/old.js'), /ENOENT/);
      // A page cached from the replaced build still finds its bundle for one more deployment.
      assert.equal(await readFile('playtest-artifacts/pages-site/pr-preview/pr-42/assets/kept.js', 'utf8'), 'previous build JS');
      assert.deepEqual(JSON.parse(await readFile('playtest-artifacts/pages-site/pr-preview/pr-42/revision.json', 'utf8')).files, build.files);
      assert.equal(await readFile('playtest-artifacts/pages-site/pr-preview/pr-42/assets/new.js', 'utf8'), 'throw Error("static data only")');
      const tree = writes.find(w => w.path === 'git/trees').body.tree;
      assert.ok(tree.some(entry => entry.path === 'assets/main.js'));
      assert.ok(tree.some(entry => entry.path === 'pr-preview/pr-42/index.html'));
      assert.ok(tree.every(entry => !entry.path.startsWith('pr-preview/pr-41/')));
      assert.equal(writes.at(-1).body.force, false);
      assert.deepEqual(writes.find(w => w.path === 'git/commits').body.parents, [source]);
    } finally {
      globalThis.fetch = oldFetch; process.chdir(cwd);
      for (const key of envKeys) if (env[key] === undefined) delete process.env[key]; else process.env[key] = env[key];
    }
  });
});

test('publication resolver refuses failed, stale, fork and wrong-workflow runs before artifact access', async () => {
  await temporary(async root => {
    const cwd = process.cwd(), oldFetch = globalThis.fetch;
    const keys = ['GITHUB_REPOSITORY', 'GH_TOKEN', 'GITHUB_EVENT_PATH', 'GITHUB_OUTPUT', 'PAGES_SITE_URL', 'GITHUB_RUN_ID'];
    const env = Object.fromEntries(keys.map(key => [key, process.env[key]]));
    try {
      process.chdir(root); process.env.GITHUB_REPOSITORY = repository; process.env.GH_TOKEN = 'fake-test-token';
      process.env.GITHUB_EVENT_PATH = join(root, 'event.json'); process.env.GITHUB_OUTPUT = join(root, 'output.txt');
      process.env.PAGES_SITE_URL = 'https://example.com/sector-control/'; process.env.GITHUB_RUN_ID = '456';
      await writeFile('event.json', JSON.stringify({workflow_run: {id: 123}}));
      const run = {id: 123, run_attempt: 1, head_sha: head, path: '.github/workflows/ci.yml', head_repository: {full_name: repository}, event: 'pull_request', conclusion: 'success', pull_requests: [{number: 42}]};
      const pr = {number: 42, state: 'open', head: {sha: head, repo: {full_name: repository}}, base: {ref: 'main', repo: {full_name: repository}}};
      for (const scenario of [
        {run, pr, publish: true, number: 42},
        {run: {...run, conclusion: 'failure'}, pr, publish: false, number: 42},
        {run, pr: {...pr, head: {...pr.head, sha: source}}, publish: false, number: 0},
        {run, pr: {...pr, state: 'closed'}, publish: false, number: 0},
        {run, pr: {...pr, head: {...pr.head, repo: {full_name: 'someone/fork'}}}, publish: false, number: 0},
        {run: {...run, path: '.github/workflows/evil.yml'}, pr, publish: false, number: 0},
      ]) {
        const requests = [];
        globalThis.fetch = async (url, options) => {
          const path = String(url).split(`/repos/${repository}/`)[1]; requests.push(path);
          return new Response(JSON.stringify(path === 'actions/runs/123' ? scenario.run : path === 'pulls/42' ? scenario.pr : {}));
        };
        await resolveContext();
        const result = JSON.parse(await readFile('playtest-artifacts/pages-context.json', 'utf8'));
        assert.equal(result.publish, scenario.publish); assert.equal(result.pr, scenario.number);
        assert.equal(requests.some(path => /artifacts|git\/blobs|git\/refs/.test(path)), false);
        assert.equal(requests.some(path => path.startsWith('statuses/')), scenario.publish);
      }
    } finally {
      globalThis.fetch = oldFetch; process.chdir(cwd);
      for (const key of keys) if (env[key] === undefined) delete process.env[key]; else process.env[key] = env[key];
    }
  });
});

test('the publisher deploys one artifact name per attempt and retries only a failed deployment', async () => {
  const workflow = await readFile(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
  const name = 'github-pages-${{ github.run_attempt }}';
  // One upload and three deployment steps all use this attempt's name.
  assert.equal(workflow.split(`name: ${name}`).length - 1, 4);
  assert.equal(workflow.split(`artifact_name: ${name}`).length - 1, 3);
  const steps = workflow.split(/\n      - /).filter(step => step.includes('actions/deploy-pages@'));
  assert.equal(steps.length, 3);
  const [first, retry, final] = steps;
  assert.match(first, /id: deploy\n/);
  assert.doesNotMatch(first, /outcome/);
  assert.match(retry, /steps\.deploy\.outcome == 'failure'/);
  assert.match(final, /steps\.deploy_retry\.outcome == 'failure'/);
  // Only the last attempt may fail the job.
  assert.match(first, /continue-on-error: true/);
  assert.match(retry, /continue-on-error: true/);
  assert.doesNotMatch(final, /continue-on-error/);
  for (const step of steps) assert.match(step, /steps\.context\.outputs\.publish == 'true'/);
  assert.ok(workflow.indexOf('upload-pages-artifact@') < workflow.indexOf('deploy-pages@'));
  assert.match(workflow, /url: \$\{\{ steps\.deploy\.outputs\.page_url \|\| steps\.deploy_retry\.outputs\.page_url \|\| steps\.deploy_final\.outputs\.page_url \}\}/);
});

test('a replaced build keeps only its own hashed bundle files, for one deployment', () => {
  const file = name => ({sha: name});
  const existing = new Map([['index.html', file('old html')], ['assets/main-OLD.js', file('old js')], ['assets/main-OLDER.js', file('older js')],
    ['previews/map.jpg', file('old image')], ['pr-preview/pr-7/assets/app-OLD.js', file('pr js')], ['pr-preview/pr-7/index.html', file('pr html')]]);
  const incoming = new Map([['index.html', file('new html')], ['assets/main-NEW.js', file('new js')]]);
  // The replaced production build listed main-OLD.js; main-OLDER.js was a leftover from the build before.
  const listed = ['index.html', 'assets/main-OLD.js', 'previews/map.jpg', 'assets/../index.html', 'assets/nested/x.js', 'assets/missing.js', 7];
  const next = replaceBuild(existing, incoming, 0, listed);
  assert.deepEqual([...next.keys()].sort(), ['assets/main-NEW.js', 'assets/main-OLD.js', 'index.html', 'pr-preview/pr-7/assets/app-OLD.js', 'pr-preview/pr-7/index.html']);
  assert.equal(next.get('index.html').sha, 'new html');
  // The next production publish lists only main-NEW.js as the replaced build's file, so main-OLD.js goes.
  const after = replaceBuild(next, new Map([['index.html', file('newest html')], ['assets/main-NEWEST.js', file('newest js')]]), 0, ['index.html', 'assets/main-NEW.js']);
  assert.deepEqual([...after.keys()].filter(path => !path.startsWith('pr-preview/')).sort(), ['assets/main-NEW.js', 'assets/main-NEWEST.js', 'index.html']);
  // A preview keeps its own replaced bundle and never touches production or siblings.
  const preview = replaceBuild(existing, new Map([['index.html', file('pr new')], ['assets/app-NEW.js', file('pr new js')]]), 7, ['assets/app-OLD.js', 'assets/main-OLD.js']);
  assert.deepEqual([...preview.keys()].filter(path => path.startsWith('pr-preview/pr-7/')).sort(), ['pr-preview/pr-7/assets/app-NEW.js', 'pr-preview/pr-7/assets/app-OLD.js', 'pr-preview/pr-7/index.html']);
  assert.equal(preview.get('assets/main-OLD.js').sha, 'old js');
  // An incoming file of the same name always wins over the retained one.
  assert.equal(replaceBuild(existing, new Map([['index.html', file('h')], ['assets/main-OLD.js', file('rebuilt')]]), 0, ['assets/main-OLD.js']).get('assets/main-OLD.js').sha, 'rebuilt');
});

test('a lagging Pages edge is retried with fresh URLs, but a different publication still fails', async () => {
  const base = 'https://example.com/sector-control/pr-preview/pr-42/';
  const current = manifest(), previous = {...manifest(), run: 122};
  const expected = {head, source, run: 123, attempt: 1};
  const urls = [], logs = [];
  let waits = 0;
  // Two answers from an edge still serving the previous build, then the expected one.
  const lagging = async url => { urls.push(String(url)); return new Response(JSON.stringify(urls.length < 3 ? previous : current)); };
  const options = {wait: async () => {waits++;}, log: line => logs.push(line)};
  assert.deepEqual(await awaitPublishedManifest(base, expected, {...options, fetcher: lagging}), current);
  assert.deepEqual([urls.length, waits, logs.length], [3, 2, 2]);
  assert.equal(new Set(urls).size, 3, 'every attempt asks a URL no cache has seen');
  for (const url of urls) assert.match(url, /revision\.json\?revision=a{40}&run=123&attempt=1&check=/);
  // A newer publication never matches: it fails after the last attempt, not before.
  let asked = 0;
  const replaced = async () => { asked++; return new Response(JSON.stringify({...manifest(), run: 124})); };
  await assert.rejects(awaitPublishedManifest(base, expected, {...options, attempts: 4, fetcher: replaced}), /provenance mismatch/);
  assert.equal(asked, 4);
  // A bad target is a caller error, not lag.
  asked = 0;
  await assert.rejects(awaitPublishedManifest('http://example.com/x', expected, {...options, fetcher: replaced}), /Invalid verification target/);
  assert.equal(asked, 0);
});
