// Tier 2: live integration test. Opt-in only — gated behind RUN_LIVE=1 and real
// secrets, run via `pnpm test:live`. Never gates `pnpm test` (ADR-0010).
//
// Requires NOTION_TOKEN, NOTION_LINKS_DATABASE_ID, and REDIS_URL. Runs in dry-run,
// so it reads Notion, scrapes, caches, and health-checks without committing or
// deploying anything.
import { localCtx } from "@render-lab/test-utils";
import { describe, expect, it } from "vitest";
import { rebuild } from "../src/rebuild.js";

describe.skipIf(!process.env.RUN_LIVE)("grouplink.rebuild (live)", () => {
  it("reads the real Notion database and enriches every link", async () => {
    expect(process.env.NOTION_TOKEN, "set NOTION_TOKEN").toBeTruthy();
    expect(
      process.env.NOTION_LINKS_DATABASE_ID,
      "set NOTION_LINKS_DATABASE_ID to the real links database",
    ).toBeTruthy();
    expect(process.env.REDIS_URL, "set REDIS_URL to a Key Value instance").toBeTruthy();

    const result = await rebuild.func(localCtx(), { dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.committed).toBe(false);
    expect(result.linkCount).toBeGreaterThan(0);
    expect(result.deadLinks, "every link should resolve").toEqual([]);
  }, 120_000);

  it("serves the second run from the Key Value cache", async () => {
    expect(process.env.REDIS_URL, "set REDIS_URL to a Key Value instance").toBeTruthy();

    await rebuild.func(localCtx(), { dryRun: true });
    const second = await rebuild.func(localCtx(), { dryRun: true });

    expect(second.cacheHits).toBe(second.linkCount);
  }, 120_000);
});
