// Config resolution: per-run input overrides, then env, then defaults.
// Same shape as the render-tasks examples — the workflow task reads nothing
// from process.env directly.

export interface RebuildInput {
  databaseId?: string;
  peopleDatabaseId?: string;
  dryRun?: boolean;
  limit?: number;
}

export interface RebuildConfig {
  /** Notion database holding the link rows. */
  databaseId: string;
  /** Notion database holding one row per person: Name, Slug, Tagline. */
  peopleDatabaseId: string;
  limit: number;
  /** Skips the commit, the deploy, and the Slack post. */
  dryRun: boolean;

  /** Slug of the person the root page renders. Their page is written twice. */
  defaultSlug: string;
  /** The small line above the name. The only copy not read from Notion. */
  overline: string;

  /** Seconds a scraped metadata record stays in Key Value. */
  cacheTtlSeconds: number;

  repoOwner: string;
  repoName: string;
  branch: string;
  /** Directory the pages are committed under, without a trailing slash. */
  siteDir: string;

  staticSiteId: string;
  siteUrl: string;
}

function envFlag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return value !== "false" && value !== "0";
}

function envInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadConfig(
  input: RebuildInput = {},
  env: NodeJS.ProcessEnv = process.env,
): RebuildConfig {
  const databaseId = input.databaseId ?? env.NOTION_LINKS_DATABASE_ID ?? "";
  if (!databaseId) {
    throw new Error("set NOTION_LINKS_DATABASE_ID, or pass databaseId in the run input");
  }

  const peopleDatabaseId = input.peopleDatabaseId ?? env.NOTION_PEOPLE_DATABASE_ID ?? "";
  if (!peopleDatabaseId) {
    throw new Error(
      "set NOTION_PEOPLE_DATABASE_ID, or pass peopleDatabaseId in the run input",
    );
  }

  // Required, because an unset value would silently publish a site with no root page.
  const defaultSlug = (env.SITE_DEFAULT_SLUG ?? "").trim().toLowerCase();
  if (!defaultSlug) {
    throw new Error("set SITE_DEFAULT_SLUG to the slug of the person the root page shows");
  }

  return {
    databaseId,
    peopleDatabaseId,
    limit: input.limit ?? envInt(env.LINKS_LIMIT, 100),
    dryRun: input.dryRun ?? envFlag(env.DRY_RUN, true),

    defaultSlug,
    overline: env.SITE_OVERLINE ?? "Links",

    cacheTtlSeconds: envInt(env.METADATA_TTL_SECONDS, 86_400),

    repoOwner: env.GITHUB_REPO_OWNER ?? "",
    repoName: env.GITHUB_REPO_NAME ?? "",
    branch: env.GITHUB_BRANCH ?? "main",
    siteDir: (env.SITE_DIR ?? "site").replace(/\/+$/, ""),

    staticSiteId: env.RENDER_STATIC_SITE_ID ?? "",
    siteUrl: env.SITE_URL ?? "",
  };
}

/**
 * The write path needs more than the read path does. Called only when the run is
 * about to commit, so a dry run works with just a Notion token and a Key Value URL.
 */
export function assertWritable(cfg: RebuildConfig): void {
  const missing: string[] = [];
  if (!cfg.repoOwner) missing.push("GITHUB_REPO_OWNER");
  if (!cfg.repoName) missing.push("GITHUB_REPO_NAME");
  if (!cfg.staticSiteId) missing.push("RENDER_STATIC_SITE_ID");
  if (missing.length > 0) {
    throw new Error(`set ${missing.join(", ")}, or run with dryRun: true`);
  }
}
