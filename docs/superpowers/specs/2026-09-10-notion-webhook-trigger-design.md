# Trigger the rebuild from a Notion webhook

Date: 2026-09-10

## Goal

Rebuild the links page when someone edits Notion, instead of every three hours
whether or not anything changed. The cron job is deleted.

## What changes

Today `grouplink-rebuild` is a Render cron job on `0 */3 * * *` running
`dist/cron-trigger.js`, which calls `runCron` from `@render-lab/triggers` to
dispatch `grouplink.rebuild`. That service is removed and replaced by a web
service that Notion posts to.

```
Notion edit → Notion webhook → grouplink-webhook (web service)
                                 ├─ verify X-Notion-Signature
                                 ├─ filter event type
                                 └─ debounce 60s → dispatch grouplink.rebuild
                                                    ↓
                                              grouplink (Workflow)
```

The workflow itself is untouched. `grouplink.rebuild` still reads both Notion
databases, scrapes, health-checks, commits, deploys, and posts to Slack.

### Consequence of dropping the cron

The run is also what health-checks every link and reports dead ones to Slack.
With no schedule, a link that rots is only noticed the next time someone edits
Notion. This was chosen deliberately.

## The receiver

Two new files.

### `src/notion-webhook.ts`

All the logic, with no HTTP and no Render SDK in it, so it tests without either.

**Signature verification.** Notion sends `X-Notion-Signature: sha256=<hex>`,
an HMAC-SHA256 of the raw request body keyed by the subscription's verification
token. The receiver reads that token from `NOTION_WEBHOOK_SECRET` and compares
with `timingSafeEqual`. Buffer lengths are checked first, because
`timingSafeEqual` throws on unequal lengths.

**The verification handshake.** Creating a subscription makes Notion POST
`{"verification_token": "..."}` once. That request has no signature, and it
arrives before there is a secret to verify against. The handler accepts an
unsigned body only while `NOTION_WEBHOOK_SECRET` is unset, logs the token, and
returns 200. Once the variable is set, every request needs a valid signature.

**Event filter.** These types schedule a rebuild:

- `page.created`
- `page.deleted`
- `page.undeleted`
- `page.properties_updated`
- `page.content_updated`
- `data_source.content_updated`
- `data_source.schema_updated`

Everything else returns 204.

There is no filter on database ID. Under Notion API version 2025-09-03 an
event's `data.parent.id` is a data source ID, which is not the database ID in
`NOTION_LINKS_DATABASE_ID`, so an ID filter would drop every event. The
integration is shared with only the two databases, so filtering by type is
enough, and the debounce absorbs the extra events.

**Debounce.** A module-level timer. Each accepted event resets it; the dispatch
fires `DEBOUNCE_MS` (default 60000) after the last one. Editing eight rows in
one sitting produces one run instead of eight, and one health-check pass over
every link instead of eight.

The response is 202 with `{"scheduled": true}`, not a run ID, because the run
does not exist yet. A restart inside the debounce window drops the pending
dispatch. Notion's retries do not cover that, because we already answered 202.

### `src/webhook.ts`

The service entry point.

`@render-lab/triggers` can mount webhook adapters, but its `map()` result is
dispatched immediately, so a debounce cannot live inside an adapter. The entry
point uses the package for everything else and adds one route:

```ts
const app = createDispatchServer();          // /healthz + POST /tasks/:task
app.post("/webhooks/notion", handler);
serve({ fetch: app.fetch, port });
```

This adds `@hono/node-server` as a direct dependency for `serve`. `hono` is not
needed, because the app comes from `createDispatchServer`.

`POST /tasks/:task` stays mounted. With no cron, it is how you force a rebuild
or run a dry run with custom input from the command line.

### Deletions

- `src/cron-trigger.ts`
- the `trigger:cron` script in `package.json`
- the `CRON_TASK` env var

## Infrastructure

Remove the `grouplink-rebuild` cron block from `render.yaml` and add:

```yaml
- type: web
  name: grouplink-webhook
  runtime: node
  plan: starter
  region: oregon
  buildCommand: pnpm install --frozen-lockfile && pnpm build
  startCommand: node dist/webhook.js
  healthCheckPath: /healthz
  autoDeployTrigger: commit
  buildFilter:
    paths:
      - src/**
      - package.json
      - pnpm-lock.yaml
      - render.yaml
  envVars:
    - key: RENDER_API_KEY
      sync: false
    - key: WORKFLOW_SLUG
      sync: false
    - key: NOTION_WEBHOOK_SECRET
      sync: false
    - key: DISPATCH_TOKEN
      generateValue: true
    - key: REBUILD_TASK
      value: grouplink.rebuild
    - key: DEBOUNCE_MS
      value: "60000"
```

The service is on the starter plan so it is always on. A free instance spins
down after 15 minutes idle, and this is now the only trigger.

`buildFilter` keeps the receiver from redeploying every time the workflow
commits a page.

### Setup order

1. Apply the Blueprint. It creates the static site, the Key Value instance, and
   `grouplink-webhook`.
2. Create the Workflow in the Dashboard as before.
3. Set `WORKFLOW_SLUG` and `RENDER_API_KEY` on the receiver and deploy it.
4. In the Notion integration's Webhooks tab, create a subscription pointing at
   `https://grouplink-webhook.onrender.com/webhooks/notion` and subscribe to the
   seven event types listed above.
5. Read the verification token out of the receiver's logs, paste it into the
   Notion form, then set it as `NOTION_WEBHOOK_SECRET` on the receiver.

Step 5 is two-sided on purpose. Until `NOTION_WEBHOOK_SECRET` is set, the
receiver accepts unsigned bodies so the handshake can land.

## Tests

`test/notion-webhook.test.ts`, hermetic, with a fake dispatcher and
`vi.useFakeTimers()`:

- a correctly signed event schedules a dispatch
- a wrong signature returns 401 and schedules nothing
- an unsigned handshake body is accepted when the secret is unset, and rejected
  when it is set
- an event type outside the list returns 204
- three events inside the window produce one dispatch

## README

- Replace the cron paragraph in "Pipeline" with the webhook trigger.
- Rewrite "Deploy" for the setup order above.
- Add `NOTION_WEBHOOK_SECRET`, `DISPATCH_TOKEN`, `REBUILD_TASK`, and
  `DEBOUNCE_MS` to "Configuration"; drop `CRON_TASK`.
- Add a section on the Notion subscription and the verification handshake.
