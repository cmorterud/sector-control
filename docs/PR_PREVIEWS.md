# Playable pull request previews

Known collaborators can push feature branches and open PRs against `main`. After CI passes, a PR receives a URL such as:

`https://codymorterud.com/sector-control/pr-preview/pr-42/`

The preview contains the tested PR merge build, with assets built for that exact path. Each new passing revision replaces only that PR's files. A failed revision does not replace the previous preview, and its `preview-ready` status fails rather than presenting the older build as current. A bot updates one PR comment with the playable link, revision and browser evidence. Closing or merging removes the preview; production and sibling previews remain available.

## One-time repository setup

1. **Settings → Pages → Source: GitHub Actions.** Retain the existing setting; do not select a deployment branch. The generated `pages-content` branch is storage for complete site snapshots, not the Pages source setting.
2. Keep the **github-pages** environment restricted to `main`. Publication uses a default-branch `workflow_run` event; PR build jobs do not deploy or obtain a write token. Cleanup uses only the trusted base workflow on `pull_request_target: closed`.
3. Protect `main` with a ruleset or branch protection: require a PR, the `pr-ready` check and `preview-ready` status, resolved review conversations, and one approving review. Dismiss stale approvals and prevent force pushes/deletion. Include administrators if everyone should follow the same process. Require the GitHub Actions app as the status source where GitHub offers that setting.
4. Invite the known contributor under **Settings → Collaborators**. They need no hosting account or deployment secrets. Keep deployment/workflow changes under owner review.
5. The publisher uses job-scoped `GITHUB_TOKEN` permissions. No personal token, global write-token default or new hosting service is needed. Do not protect `pages-content` against the publisher's generated commits; it contains disposable static output only.

The checks must run once before they can be selected in protection settings. A `CODEOWNERS` rule for workflows is useful alongside required code-owner review. Branch protections are repository settings, not established by committing these workflows. The owner must enable and verify them before treating the checks as enforced merge gates.

## Publication sequence

`ci.yml` runs with read-only repository access. The type-checked Vite build and publisher regressions run alongside three independent game-test shards. All seven browser jobs start once the build artifact is ready. The artifact includes `revision.json` with the tested merge SHA, PR head SHA, CI run and attempt, deployment base and asset hashes. The `pr-ready` job requires the build, all three test shards, and all seven browser jobs to succeed. A new revision cancels the previous in-flight CI for that PR. Branches without a PR can run the workflow manually.

`pages.yml` runs only trusted automation from `main`. It validates the originating workflow, source repository, live PR/head or current main revision, and successful CI conclusion before downloading its `production-build` artifact. Ordinary branch pushes and fork PRs never publish automatically. Old CI completions cannot revive a closed preview or overwrite a newer PR revision. Main must publish once before the first preview, so a PR cannot become the production site.

The publisher treats artifacts as static bytes, without installing dependencies or executing their scripts. It rejects hidden paths, traversal, symbolic/hard links, unsupported files and mismatched asset hashes. It replaces only production's root files or the selected PR subtree, prunes closed previews, and saves a full snapshot on `pages-content` with a non-forced ref update. Site snapshots are limited to 512 MiB, individual files to 50 MiB and file count to 10,000. Extend the explicit static extension allowlist when introducing another asset format.

Publication, cleanup and final preview status writes share a FIFO concurrency group with `queue: max`. The GitHub Pages write finishes before the queue advances. Main updates preserve active previews, and PR updates preserve production. Read-only verification can run while the next publication enters the queue.

A single read-only job verifies the deployed `revision.json` and hashes every asset, then replays Industrial's combat feedback in Chrome. CI has already played every map on the same bytes, so the deployed replay covers hosting (base path, MIME types, caching) rather than repeating each map. The replay verifies the expected CI run, attempt and head before opening Chrome and checks that the same revision still serves afterward. The reporting job requires every check to pass and confirms that the current Pages snapshot still belongs to that attempt before setting `preview-ready`. Cleanup runs only for PRs closed without merging, since main's own publication prunes a merged PR's preview; it verifies production responds and the closed preview returns 404. A cancelled (superseded) CI run starts no publication. CDN propagation is retried. Preview URLs are public and share production's web origin, so automatic previews are limited to trusted same-repository branches.

## Recovery and maintenance

- Find logs in **Actions → Publish playable Pages previews**. Build/render evidence remains in the upstream CI run; deployed browser evidence is attached to the publisher run.
- Pages caches each page for up to ten minutes, so a visitor can be served the replaced build's HTML just after a deployment. Each build therefore keeps the hashed files under `assets/` of the build it replaced for one more deployment, and the deployed browser checks request a URL unique to their revision and fail if the page loads anything outside the published build. Pages edges do not all switch to a new deployment at once, so those checks retry their manifest reads (up to 12 times, 5 s apart) and reload a page that is still the previous build (up to 6 times) before failing.
- Re-run a failed publisher run to retry a transient error. Each attempt uploads its site as `github-pages-<attempt>`, so a re-run never collides with the earlier attempt's artifact. The deployment's own artifact lookup can miss a just-finished upload, so the publisher pauses five seconds and retries a failed deployment up to twice (after 20 s, then 40 s); an error annotation from an earlier attempt on a green run is expected. For an expired artifact, rerun its CI first. Seven-day CI artifact retention does not limit already published previews; snapshots persist on `pages-content` until cleanup.
- To republish a successful CI run, manually run `pages.yml` on `main` and supply its numeric run ID. A blank run ID prunes closed previews and redeploys the saved site.
- Do not edit generated files on `pages-content` or run builds from that branch. Keep production and previews inside this single publisher; a second workflow deploying a production-only artifact would erase the preview directories.
- For a fork or different domain, update `PAGES_SITE_URL` in `pages.yml` and the CI base expression as appropriate. A project site needs `/<repository>/`; a site hosted at the domain root needs `/`.
- Fork PRs still receive build/render checks. To playtest one, first review it and bring the approved changes into a branch in this repository. Do not grant privileged deployment tokens to untrusted PR workflows.

After enabling protection, verify it with a deliberately failing draft PR: both merging and direct pushes to `main` should be rejected. Use another account to check collaborator enforcement; owner bypass permissions can otherwise hide an incorrect configuration.
