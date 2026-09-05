// The whole page. One function, one string, no framework and no build step —
// grouplink.rebuild commits whatever this returns as site/index.html.
//
// Visual foundations come from Render's brand system: semantic color tokens in
// :root with a dark override, Roobert Light for the name, PP Neue Montreal for
// prose, PP Neue Montreal Mono for the overline and socials, square corners,
// 1px hairlines, purple reserved for links and focus.

export interface LinkCard {
  /** Display text. Comes from Notion, not from the scrape. */
  title: string;
  /** Final href, UTM already applied. */
  url: string;
  /** Scraped og:title or meta description; may be empty. */
  description: string;
  /** `<origin>/favicon.ico`, hidden on error. */
  iconUrl: string;
}

export interface SocialLink {
  label: string;
  url: string;
}

export interface PageModel {
  name: string;
  tagline: string;
  overline: string;
  cards: LinkCard[];
  socials: SocialLink[];
  /** ISO timestamp of the run that produced the page. */
  generatedAt: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Allow only http(s) hrefs into the document. Anything else — javascript:,
 * data:, a malformed string from Notion — collapses to "#".
 */
export function safeUrl(value: string): string {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "#";
    return parsed.toString();
  } catch {
    return "#";
  }
}

const STYLES = `
@font-face {
  font-family: 'Roobert';
  src: url('/assets/fonts/RoobertVF.woff2') format('woff2-variations');
  font-weight: 300 500;
  font-display: swap;
}
@font-face {
  font-family: 'PP Neue Montreal';
  src: url('/assets/fonts/PPNeueMontreal-Variable.woff2') format('woff2-variations');
  font-weight: 300 500;
  font-display: swap;
}
@font-face {
  font-family: 'PP Neue Montreal Mono';
  src: url('/assets/fonts/PPNeueMontrealMono-Medium.woff2') format('woff2');
  font-weight: 500;
  font-display: swap;
}

:root {
  --bg: #ffffff;
  --bg-secondary: #e3e3e3;
  --border: #e3e3e3;
  --text: #0d0d0d;
  --text-secondary: #4d4d4d;
  --text-faint: #6b6b6b;
  --text-overline: #6b6b6b;
  --link: #8a05ff;
  --link-hover: #48008c;
  --link-bg: #e7dbff;
  --accent: #8a05ff;
  --accent-strong: #48008c;

  --font-brand: 'Roobert', 'Manrope', ui-sans-serif, system-ui, sans-serif;
  --font-default: 'PP Neue Montreal', 'Manrope', ui-sans-serif, system-ui, sans-serif;
  --font-mono: 'PP Neue Montreal Mono', 'Roboto Mono', ui-monospace, SFMono-Regular, Menlo, monospace;

  --ease: cubic-bezier(0.9, 0.1, 0.1, 0.9);

  color-scheme: light dark;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0d0d0d;
    --bg-secondary: #141414;
    --border: #272727;
    --text: #ffffff;
    --text-secondary: #c7c7c7;
    --text-faint: #b3b3b3;
    --text-overline: #b3b3b3;
    --link: #d1b8ff;
    --link-hover: #e7dbff;
    --link-bg: #48008c;
    --accent: #8a05ff;
    --accent-strong: #c29eff;
  }
}

*, *::before, *::after { box-sizing: border-box; }

html { -webkit-text-size-adjust: 100%; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-default);
  font-weight: 400;
  font-size: 16px;
  line-height: 24px;
  letter-spacing: 0.01em;
  -webkit-font-smoothing: antialiased;
}

.page {
  max-width: 480px;
  margin: 0 auto;
  padding: 96px 32px 64px;
  display: flex;
  flex-direction: column;
  gap: 40px;
}

.masthead {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 16px;
}

.mark { width: 48px; height: 48px; display: block; }
.mark--dark { display: none; }
@media (prefers-color-scheme: dark) {
  .mark--light { display: none; }
  .mark--dark { display: block; }
}

.name {
  font-family: var(--font-brand);
  font-weight: 300;
  font-size: 40px;
  line-height: 44px;
  letter-spacing: -0.015em;
  margin: 0;
}

.tagline {
  margin: 0;
  font-size: 18px;
  line-height: 26px;
  color: var(--text-secondary);
  max-width: 40ch;
}

.overline {
  font-family: var(--font-mono);
  font-weight: 500;
  font-size: 12px;
  line-height: 16px;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--text-overline);
  margin: 0 0 16px;
}

.links { display: flex; flex-direction: column; gap: 12px; }

.card {
  display: grid;
  grid-template-columns: 20px 1fr auto;
  align-items: start;
  gap: 16px;
  padding: 16px;
  border: 1px solid var(--border);
  background: var(--bg);
  text-decoration: none;
  color: inherit;
  min-height: 56px;
}

.card:hover { border-color: var(--text-faint); }
.card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.card__icon { width: 20px; height: 20px; margin-top: 2px; display: block; }
.card__title { font-size: 16px; line-height: 24px; }
.card__desc {
  margin: 4px 0 0;
  font-size: 14px;
  line-height: 20px;
  color: var(--text-faint);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card__arrow {
  color: var(--text-faint);
  line-height: 24px;
  transition: transform 150ms var(--ease);
}
.card:hover .card__arrow { transform: translateX(2px); }

.socials {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  padding-top: 24px;
  border-top: 1px solid var(--border);
}

.social {
  font-family: var(--font-mono);
  font-weight: 500;
  font-size: 12px;
  line-height: 16px;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--link);
  text-decoration: none;
  position: relative;
  padding-bottom: 2px;
}

.social::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 1px;
  background: currentColor;
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 200ms var(--ease);
}
.social:hover { color: var(--link-hover); }
.social:hover::after { transform: scaleX(1); }
.social:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; }

.stamp {
  font-family: var(--font-mono);
  font-weight: 500;
  font-size: 11px;
  line-height: 14px;
  letter-spacing: 0.025em;
  text-transform: uppercase;
  color: var(--text-overline);
}

@media (max-width: 767px) {
  .page { padding: 48px 16px 40px; gap: 32px; }
  .name { font-size: 32px; line-height: 36px; letter-spacing: -0.012em; }
  .card { min-height: 44px; }
}

@media (prefers-reduced-motion: reduce) {
  .card__arrow { transition: none; }
  .social::after { transition: none; transform: scaleX(0); }
  .social:hover::after { transform: scaleX(1); }
}
`;

function renderCard(card: LinkCard): string {
  const href = escapeHtml(safeUrl(card.url));
  const title = escapeHtml(card.title);
  const desc = card.description
    ? `<p class="card__desc">${escapeHtml(card.description)}</p>`
    : "";
  const icon = card.iconUrl
    ? `<img class="card__icon" src="${escapeHtml(safeUrl(card.iconUrl))}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`
    : `<span class="card__icon"></span>`;
  return `      <a class="card" href="${href}">
        ${icon}
        <span>
          <span class="card__title">${title}</span>
          ${desc}
        </span>
        <span class="card__arrow" aria-hidden="true">&#8594;</span>
      </a>`;
}

function renderSocial(social: SocialLink): string {
  return `      <a class="social" href="${escapeHtml(safeUrl(social.url))}">${escapeHtml(social.label)}</a>`;
}

export function renderPage(model: PageModel): string {
  const cards = model.cards.map(renderCard).join("\n");
  const socials = model.socials.map(renderSocial).join("\n");
  const socialsBlock = socials
    ? `    <nav class="socials" aria-label="Social">
${socials}
    </nav>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(model.name)} — links</title>
<meta name="description" content="${escapeHtml(model.tagline)}">
<meta property="og:title" content="${escapeHtml(model.name)} — links">
<meta property="og:description" content="${escapeHtml(model.tagline)}">
<meta property="og:type" content="website">
<link rel="icon" href="/assets/render-logo-black.svg" media="(prefers-color-scheme: light)">
<link rel="icon" href="/assets/render-logo-white.svg" media="(prefers-color-scheme: dark)">
<style>${STYLES}</style>
</head>
<body>
  <main class="page">
    <header class="masthead">
      <img class="mark mark--light" src="/assets/render-logo-black.svg" alt="${escapeHtml(model.name)}" width="48" height="48">
      <img class="mark mark--dark" src="/assets/render-logo-white.svg" alt="" width="48" height="48" aria-hidden="true">
      <h1 class="name">${escapeHtml(model.name)}</h1>
      <p class="tagline">${escapeHtml(model.tagline)}</p>
    </header>

    <section>
      <h2 class="overline">${escapeHtml(model.overline)}</h2>
      <div class="links">
${cards}
      </div>
    </section>

${socialsBlock}

    <p class="stamp">Updated ${escapeHtml(model.generatedAt.slice(0, 10))}</p>
  </main>
</body>
</html>
`;
}
