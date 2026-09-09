# Manual setup

Everything grouplink needs that the code can't do for you, in order. The repo is
built and tested but has never run against real Notion, GitHub, or Render.

Work through this top to bottom. Steps 1 and 2 can happen in either order;
everything after 3 depends on the ones before it.

---

## 1. Publish `@render-lab/tasks-notion` 0.6.0

Reading a Notion relation needs the change in
[render-lab/render-tasks#28](https://github.com/render-lab/render-tasks/pull/28).
Until it publishes, grouplink runs on a local patch that fakes it.

1. Get PR #28 reviewed and merged.
2. In render-tasks, Actions → **Publish npm package** → Run workflow →
   `@render-lab/tasks-notion`.
3. Back in grouplink:
   ```bash
   pnpm remove @render-lab/tasks-notion
   pnpm add @render-lab/tasks-notion@^0.6.0
   rm patches/@render-lab__tasks-notion@0.5.0.patch
   ```
   Then delete the `patchedDependencies` block from `pnpm-workspace.yaml` and run
   `pnpm install && pnpm test`. All 52 tests should still pass. If they do, the
   published package behaves the same as the patch.

Do not skip the cleanup. A patch pinned to 0.5.0 stops applying the moment the
version moves, and pnpm fails the install rather than warning.

---

## 2. Create the two Notion databases

Both live in the same workspace, and both get shared with the same integration.

### People

Create this one first, because the links database points at it.

| Property | Type | Notes |
| --- | --- | --- |
| `Name` | Title | The heading on the page. "Shifra Williams". |
| `Slug` | Text | The URL path, lowercase, no slashes. `shifra` serves at `/shifra`. |
| `Tagline` | Text | One line under the name. |

Add a row for yourself:

| Name | Slug | Tagline |
| --- | --- | --- |
| Shifra Williams | `shifra` | Developer relations at Render. |

A row with a blank `Name` or `Slug` is skipped, because neither the heading nor the
path can be built without both.

### Links

| Property | Type | Notes |
| --- | --- | --- |
| `Title` | Title | Card text. This is the copy you control; nothing overwrites it. |
| `URL` | URL | Where the card points. |
| `Order` | Number | Ascending. A row without one sorts last. |
| `Visible` | Checkbox | Unchecked rows are dropped. Check it on every row you want live. |
| `Kind` | Select | Options `Link` and `Social`. Only `Social` is matched; anything else renders a card. |
| `Everyone` | Checkbox | Checked puts the link on every person's page. |
| `People` | Relation | Related to the People database. |

`Link` renders a card. `Social` renders as text in the mono row at the bottom,
because Render's brand rules want thin single-stroke icons and the YouTube,
LinkedIn, and X marks are filled logos.

`Everyone` and `People` together decide where a link appears, and the two are a
union. Check `Everyone` for the links every page carries, like the Render website.
Use `People` for the rest: relate a row to two people and it appears on both pages,
fetched once. A row with `Everyone` unchecked and no relation renders nowhere.
There is no "all links" page.

Seed it with the four links and three socials from `scripts/placeholder.ts`. Check
`Everyone` on the ones that belong on every page and relate the rest to your People
row.

### Share both with an integration

1. notion.so/my-integrations → **New integration**, internal, in your workspace.
   Copy the token. This is `NOTION_TOKEN`.
2. On each database: **⋯ → Connections → Connect to →** your integration. Missing
   this on one of the two is the most common cause of an empty page.
3. Copy each database ID out of its URL. In
   `notion.so/<workspace>/<32-hex-chars>?v=…`, the 32 hex characters are the ID.
   Links → `NOTION_LINKS_DATABASE_ID`. People → `NOTION_PEOPLE_DATABASE_ID`.

---

## 3. Commit and push the repo

The repo has zero commits and every file is untracked. The workflow commits back to
this repo, so it has to exist on GitHub first.

```bash
git add .
git commit -m "feat: grouplink, a Notion-driven links page with per-person pages"
git push -u origin main
```

Check that `.env` is not in the commit. `.gitignore` covers it, and the file was
deleted after the last dev-server run, but check anyway.

`site/assets/fonts/` holds three commercial woff2 files (Roobert, PP Neue Montreal,
PP Neue Montreal Mono). You decided the Render license covers serving them from a
Render brand page, so they ship. To reverse that later, delete the four
`@font-face` blocks in `src/render.ts` and load Manrope and Roboto Mono instead;
the fallback chain already names both.

---

## 4. Create a GitHub token

Fine-grained, scoped to the grouplink repo, with **Contents: Read and write**. That
is the only permission the workflow needs. This is `GITHUB_TOKEN`.

---

## 5. Apply the Blueprint

Render Dashboard → **New → Blueprint** → pick this repo. It creates three
resources:

- `grouplink-site`, the static site
- `grouplink-cache`, the Key Value instance
- `grouplink-rebuild`, the cron job that rebuilds every three hours

Note two things before moving on: the static site's service ID
(`RENDER_STATIC_SITE_ID`, the `srv-…` in its dashboard URL) and its public URL
(`SITE_URL`).

---

## 6. Create the Workflow service

Blueprints don't support Workflows yet, so this one is by hand.

**New → Workflow**, same repo.

| Setting | Value |
| --- | --- |
| Build command | `pnpm install && pnpm build` |
| Start command | `node dist/main.js` |
| Auto-deploy | **Off** |

Auto-deploy has to be off. The workflow commits to this repo, and leaving it on
means every page rebuild redeploys the service that produced it.

Set these env vars on the service:

| Var | Value |
| --- | --- |
| `NOTION_TOKEN` | From step 2. |
| `NOTION_LINKS_DATABASE_ID` | From step 2. |
| `NOTION_PEOPLE_DATABASE_ID` | From step 2. |
| `REDIS_URL` | `grouplink-cache`'s **internal** connection string. |
| `GITHUB_TOKEN` | From step 4. |
| `GITHUB_REPO_OWNER` | `Ho1yShif` |
| `GITHUB_REPO_NAME` | `grouplink` |
| `RENDER_API_KEY` | A Render API key with deploy rights. |
| `RENDER_STATIC_SITE_ID` | From step 5. |
| `SITE_URL` | From step 5. |
| `SITE_DEFAULT_SLUG` | `shifra` |
| `DRY_RUN` | `true` for now. |
| `SLACK_WEBHOOK_URL` | Optional. Unset logs the digest to the console. |

`SITE_DEFAULT_SLUG` is required, and the run fails fast if it matches no `Slug` in
the People database. That person's page is written to both `site/index.html` and
`site/<slug>/index.html`, so `/` and `/shifra` serve the same bytes.

Deploy, then confirm `grouplink.rebuild` appears on the service's Tasks page. Note
the service slug.

---

## 7. Finish the cron job

On `grouplink-rebuild`, set `RENDER_API_KEY` and `WORKFLOW_SLUG` (the slug from
step 6). `CRON_TASK` is already set by the Blueprint.

---

## 8. First run

Trigger `grouplink.rebuild` from the Workflow's Tasks page with `DRY_RUN` still
`true`. Read the result:

- `pageCount` should equal the number of People rows.
- `linkCount` should equal the distinct card URLs, counting a shared link once.
- `deadLinks` should be empty. If it isn't, fix the URL in Notion before going
  further.

Then set `DRY_RUN=false` and run it again. It should commit, deploy, and post to
Slack. Check that both `site/index.html` and `site/shifra/index.html` are in the
commit.

---

## 9. Check the `/shifra` URL

This is the one thing I couldn't verify without a real deploy. A person's page is
written to `site/<slug>/index.html`, and Render's CDN should serve it at
`/shifra`. Load both:

- `https://<site>/shifra/` should work.
- `https://<site>/shifra` is the one to check.

If the bare path 404s, add a rewrite per person to `render.yaml`:

```yaml
routes:
  - type: rewrite
    source: /shifra
    destination: /shifra/index.html
```

One entry per slug. Don't use a `/*` catch-all: it would send `/alex` to Shifra's
page.

---

## 10. Tick the E2E boxes

Once a real run works, the follow-up PR to `render-lab/render-tasks` ticks eight
boxes in `docs/verification-tracker.md`, one per pack grouplink exercised
end-to-end. Unit tests passing doesn't count; that tracker records what has run
against a real service.

---

## Adding a person later

No code and no deploy. Add a People row with a name, a slug, and a tagline, relate
any links specific to them, and wait for the next three-hourly cron run or trigger
the task by hand. Every link with `Everyone` checked is on their page already. The
new page is committed on that run, because `github.listTree` reports it missing from
the branch and it counts as changed.
