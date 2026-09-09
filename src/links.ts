// Notion rows in, page model out. Pure functions — no network, no ctx.
import type { PageDTO } from "@render-lab/tasks-notion";

export type LinkKind = "link" | "social";

export interface LinkRow {
  title: string;
  url: string;
  order: number;
  visible: boolean;
  kind: LinkKind;
  /** Renders on every person's page, whatever `personIds` holds. */
  everyone: boolean;
  /** Notion page ids of the People rows this link belongs to. */
  personIds: string[];
}

/** One row of the People database. `id` is what a link's relation points at. */
export interface PersonRow {
  id: string;
  name: string;
  slug: string;
  tagline: string;
}

/** A person and the links that relate to them, in render order. */
export interface PersonPage {
  person: PersonRow;
  rows: LinkRow[];
}

/** Hosts that get Render's campaign parameters. */
const UTM_HOSTS = new Set(["render.com", "www.render.com"]);
const UTM = { utm_source: "linktree", utm_medium: "linktree" } as const;

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Notion's queryDatabase hoists the title column to `page.title` and leaves every
 * column in `page.properties`. `page.url` is the Notion page itself, not the link —
 * the link lives in the `URL` property.
 */
export function toLinkRows(pages: PageDTO[]): LinkRow[] {
  const rows: LinkRow[] = [];

  for (const page of pages) {
    const props = page.properties;
    const url = readString(props["URL"]);
    const title = readString(page.title) || readString(props["Title"]);
    if (!url || !title) continue;

    const order = typeof props["Order"] === "number" ? props["Order"] : Number.MAX_SAFE_INTEGER;
    const visible = props["Visible"] !== false;
    const kind = readString(props["Kind"]).toLowerCase() === "social" ? "social" : "link";
    const everyone = props["Everyone"] === true;
    const related = props["People"];
    const personIds = Array.isArray(related) ? related : [];

    rows.push({ title, url, order, visible, kind, everyone, personIds });
  }

  return rows;
}

/**
 * People rows. A row without a name or a slug is skipped, because neither the page
 * heading nor its path can be built without both.
 */
export function toPersonRows(pages: PageDTO[]): PersonRow[] {
  const rows: PersonRow[] = [];

  for (const page of pages) {
    const props = page.properties;
    const name = readString(page.title) || readString(props["Name"]);
    const slug = readString(props["Slug"]).toLowerCase();
    if (!name || !slug) continue;

    rows.push({ id: page.id, name, slug, tagline: readString(props["Tagline"]) });
  }

  return rows;
}

/**
 * One bundle per person. A link related to two people appears in both, and one with
 * `Everyone` checked appears on every page. The two are a union, so a row with both
 * set is redundant rather than contradictory.
 */
export function groupByPerson(rows: LinkRow[], people: PersonRow[]): PersonPage[] {
  return people.map((person) => ({
    person,
    rows: rows.filter((row) => row.everyone || row.personIds.includes(person.id)),
  }));
}

/** Distinct URLs, first-seen order. A link on three pages is fetched once. */
export function uniqueUrls(rows: LinkRow[]): string[] {
  return [...new Set(rows.map((row) => row.url))];
}

/** The default person is the root page; everyone else lives under their slug. */
export function pagePath(siteDir: string, slug: string): string {
  return slug ? `${siteDir}/${slug}/index.html` : `${siteDir}/index.html`;
}

export function visibleInOrder(rows: LinkRow[]): LinkRow[] {
  return rows.filter((row) => row.visible).sort((a, b) => a.order - b.order);
}

/**
 * The Linktree page shipped `?utm_source=linktree&?utm_medium=referral`. That second
 * `?` means the medium never parses. Build the query with URLSearchParams so it merges
 * with any parameters the row already carries.
 */
export function applyUtm(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return rawUrl;
  }
  if (!UTM_HOSTS.has(parsed.hostname)) return rawUrl;

  for (const [key, value] of Object.entries(UTM)) {
    if (!parsed.searchParams.has(key)) parsed.searchParams.set(key, value);
  }
  return parsed.toString();
}

/** Best-effort icon. The card hides the image when this 404s. */
export function faviconUrl(rawUrl: string): string {
  try {
    return new URL("/favicon.ico", rawUrl).toString();
  } catch {
    return "";
  }
}

/** The card blurb. Empty when the page has no meta description. */
export function cardDescription(meta: { description?: string }): string {
  return readString(meta.description);
}

/** Cache key for one URL's scraped metadata. `v1` lets a shape change invalidate. */
export function metaCacheKey(url: string): string {
  return `gl:meta:v1:${url}`;
}
