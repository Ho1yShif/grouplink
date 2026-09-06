# grouplink

Render's links page. The page is plain HTML on a Render static site. A Render
Workflow reads the link list from Notion, enriches it, commits `site/index.html`,
and deploys.

It replaces a Linktree page that couldn't be styled to brand, was two-thirds
Linktree's own affiliate marketplace, and shipped a malformed
`?utm_source=linktree&?utm_medium=referral` on every Render URL.

## Pipeline

`src/rebuild.ts` — one task, `grouplink.rebuild`:

```
grouplink.rebuild
├── notion.queryDatabase   ×2   read the link rows and the people
├── kv.get              ×N      look for cached metadata
├── scrape.extractMetadata ×N   scrape the misses
├── kv.set              ×N      cache them for 24h
├── http.request        ×N      health-check every link
├── github.listTree             which pages already exist on the branch
├── github.getFileContents ×N   skip the pages that haven't changed
├── github.commitFiles          write the changed pages, in one commit
├── render.triggerDeploy
├── render.awaitDeploy
└── slack.postMessage           the live URL, or the dead links
```

Every `ctx.run` is a separate durable run with the owning package's retry policy.
The `×N` steps fan out into independent chained runs, ten at a time, so a large
database does not open one run per link or hit every site at once. The URLs are
deduplicated first, so a link on three pages is scraped and health-checked once.

The health check counts a link as dead when it answers 404, 5xx, or nothing at all.
A 401, 403, 405, 429, or 999 means the site is up and refusing a request with no
browser fingerprint, which is what X and LinkedIn do.

If the run itself fails, it posts the error to Slack and rethrows. The cron job
exits as soon as it has dispatched the run, so its exit code says nothing about
the outcome.

`DRY_RUN=true` is the default. A dry run reads, scrapes, caches, and health-checks,
then returns the model without committing or deploying.

## Run it locally

```bash
pnpm install
pnpm build
cp .env.example .env      # fill in NOTION_TOKEN, NOTION_LINKS_DATABASE_ID, REDIS_URL
render workflows dev -- pnpm dev
```

In another terminal:

```bash
render workflows tasks list --local
render workflows start grouplink.rebuild --local --input='[{"dryRun":true}]'
```

`pnpm placeholder` regenerates `site/index.html` from the seed links without
touching Notion, which is useful for looking at the page in a browser.

## The Notion databases

There are two. Links:

| Property | Type | Purpose |
| --- | --- | --- |
| `Title` | title | Card text. Not scraped — this is the copy you control. |
| `URL` | url | Where the card points. |
| `Order` | number | Sort order. Rows without one sort last. |
| `Visible` | checkbox | Unchecked rows are dropped. |
| `Kind` | select | `Link` renders a card, `Social` renders in the mono row. |
| `People` | relation | Which pages the link appears on. Relate it to two rows and it appears on both. |

People:

| Property | Type | Purpose |
| --- | --- | --- |
| `Name` | title | The heading on that person's page. |
| `Slug` | text | The URL path. `shifra` serves at `/shifra`. |
| `Tagline` | text | The line under the name. |

A person's page is written to `site/<slug>/index.html`. The person named by
`SITE_DEFAULT_SLUG` is written to `site/index.html` as well, so `/` and their own
path serve the same page. A link related to nobody is rendered nowhere.

Share both databases with the Notion integration that owns `NOTION_TOKEN`.

Reading a relation needs `@render-lab/tasks-notion` 0.6.0 or later.

## Configuration

| Var | Default | Purpose |
| --- | --- | --- |
| `NOTION_TOKEN` | — | Notion integration token. |
| `NOTION_LINKS_DATABASE_ID` | — | The links database. |
| `NOTION_PEOPLE_DATABASE_ID` | — | The people database. |
| `REDIS_URL` | — | Key Value instance holding the metadata cache. |
| `GITHUB_TOKEN` | — | Needs `contents:write` on this repo. |
| `GITHUB_REPO_OWNER` / `GITHUB_REPO_NAME` | — | Where the page is committed. |
| `GITHUB_BRANCH` | `main` | Branch to commit to. |
| `RENDER_API_KEY` | — | Used to trigger the static site deploy. |
| `RENDER_STATIC_SITE_ID` | — | The static site to deploy. |
| `SITE_URL` | — | Public URL, quoted in the Slack message. |
| `SLACK_WEBHOOK_URL` | — | Optional. Unset logs the digest to the console. |
| `DRY_RUN` | `true` | Set `false` to commit and deploy. |
| `SITE_DEFAULT_SLUG` | — | Slug of the person the root page shows. |
| `SITE_OVERLINE` | `Links` | The small line above the name, on every page. |
| `SITE_DIR` | `site` | Directory the pages are committed under. |
| `METADATA_TTL_SECONDS` | `86400` | How long a scraped description is cached. |
| `LINKS_LIMIT` | `100` | Notion rows to read per run. |

Each page's name and tagline come from its People row, not from configuration.

Per-run overrides go in the input: `--input='[{"dryRun":false}]'`.

## The page

`src/render.ts` is one function returning the whole document — no framework, no
build step, inline CSS. It follows Render's brand foundations: semantic color
tokens with a dark override, Roobert Light for the name, PP Neue Montreal for
prose, mono for the overline and socials, square corners, 1px hairlines, and
purple reserved for links and focus rings.

The brand woff2 files under `site/assets/fonts/` are commercial faces. If this
repo needs to stop redistributing them, delete the four `@font-face` blocks and
load Manrope and Roboto Mono instead — the fallback chain already names them.

Assets are referenced from the site root (`/assets/…`) so they resolve the same
from `/` and from `/<slug>/`.

## Deploy

Blueprints don't support Workflows yet, so the Workflow service is created in the
Dashboard and everything else comes from [`render.yaml`](render.yaml).

1. Dashboard → **New > Blueprint**, link this repo. It creates the static site
   (`grouplink-site`), the Key Value instance (`grouplink-cache`), and the daily
   cron job (`grouplink-rebuild`). Note the static site's ID and URL.
2. Dashboard → **New > Workflow** on the same repo.
   Build: `pnpm install && pnpm build`. Start: `node dist/main.js`. Turn
   auto-deploy off — the workflow commits to this repo, and you don't want it
   redeploying itself every time the page changes.
3. Set the env vars above on the Workflow, including `REDIS_URL` from the Key
   Value instance's internal connection string. Keep `DRY_RUN=true` for the first
   deploy. Confirm the tasks appear on the service's Tasks page and note the slug.
4. Set `WORKFLOW_SLUG` and `RENDER_API_KEY` on the cron job.
5. Flip `DRY_RUN=false` and trigger a run.

`autoDeploy` is off on the static site because the workflow triggers its deploy
itself, right after committing.

## Tests

- `pnpm test` — Tier 1. Hermetic: the composition test drives the real
  `grouplink.rebuild`, routing every chained run to the owning package's `*Impl`
  with a fake at the vendor port. No network, no secrets.
- `pnpm test:live` — Tier 2. Hits real Notion, real sites, and a real
  Key Value instance in dry-run.

## Where the tasks come from

Every step is a published task from
[render-tasks](https://github.com/render-lab/render-tasks), installed from npm:
`@render-lab/tasks-{notion,scrape,render-kv,http,github,render,slack}` and
`@render-lab/triggers`. `.npmrc` pins a single physical copy of `@renderinc/sdk`,
because two copies mean tasks register against different registries and silently
never run.
