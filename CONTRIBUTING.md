# Contributing to Sector Control

Use a feature branch and a pull request against `main`. Known collaborators can push their branches directly to this repository. Keep each PR focused on one gameplay, art or infrastructure change; describe what a player will notice and how to reproduce it.

## Local checks

Use Node.js 26 to match CI:

```sh
npm ci
npm run check -- --maxWorkers=1
npm run test:pages
npm run build
```

Run the game with `npm run dev`. Add regression coverage for gameplay or collision changes, and test the affected map. Useful launch parameters are listed in the README. Include before/after screenshots when changing models, lighting, terrain, buildings or the HUD.

## Playtest the PR

CI builds and runs three game-test shards in parallel. The seven map renders start when the build is ready. A passing same-repository PR receives a playable Pages preview. Wait for `preview-ready` and the bot's **Play this PR** link; the comment identifies the exact head revision. If a later revision fails, the old preview may remain online, so do not assume the URL contains your newest changes.

Use that link to check movement and mantling, first/third person switching, aiming and firing, reloading, artillery, destruction, pause/resume, redeploy and map selection as relevant to the change. The automated screenshots use software rendering and do not establish real hardware performance or replace playing the controls yourself.

Push fixes to the same branch. A newer PR revision cancels its older CI run and updates the preview after passing. To run the full suite on a branch before opening a PR, use **Run workflow** in Actions. Closing or merging the PR removes the preview. Do not edit or push generated files on `pages-content`.

## Review and assets

The intended merge requirements are `pr-ready`, `preview-ready`, resolved conversations and owner approval. The repository owner must enable these in GitHub's protection settings; see [PR_PREVIEWS.md](docs/PR_PREVIEWS.md). Workflow and deployment changes require particular care because they control publication and permissions.

Keep deployment tokens out of PR builds, do not introduce `pull_request_target` jobs that run contributor code, and keep preview publishing restricted to reviewed same-repository branches. Never commit credentials, private playtest data or generated browser profiles.

For contributed models, textures, audio and other assets, record their source, author, license and any attribution requirements beside the assets. Confirm the owner is comfortable distributing them under this project's licensing before merging. Avoid unexplained binary replacements or large assets without a clear gameplay or visual benefit.
