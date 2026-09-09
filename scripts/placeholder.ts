// Regenerates site/index.html from the seed links, without scraped descriptions.
// The workflow overwrites this file on its first real run; it exists so the static
// site has something to serve before then. Run with `pnpm placeholder`.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { applyUtm, faviconUrl } from "../src/links.js";
import { renderPage, type LinkCard } from "../src/render.js";

const SEED: Array<{ title: string; url: string }> = [
  { title: "Join the Render Developers Discord", url: "https://discord.com/invite/gWBFXry3rY" },
  { title: "Funded founder? Apply to the Render startup program", url: "https://render.com/startups" },
  { title: "Website", url: "https://render.com/" },
  { title: "Tutorial | Get started with Render Workflows", url: "https://render.com/tutorials/render-workflows" },
];

const html = renderPage({
  name: "Render",
  tagline: "The fastest path to production for full-stack applications and agents",
  cards: SEED.map(
    (link): LinkCard => ({
      title: link.title,
      url: applyUtm(link.url),
      description: "",
      iconUrl: faviconUrl(link.url),
    }),
  ),
  socials: [
    { label: "YouTube", url: "https://www.youtube.com/@render-inc" },
    { label: "LinkedIn", url: "https://www.linkedin.com/company/renderco" },
    { label: "X", url: "https://x.com/render" },
  ],
});

const outPath = fileURLToPath(new URL("../site/index.html", import.meta.url));
writeFileSync(outPath, html);
console.log(`wrote ${outPath} (${html.length} bytes)`);
