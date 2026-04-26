import fs from "node:fs/promises";

const siteRoot = "https://selarl-abitbol-neuman-et-associes.chirurgiens-dentistes.fr";
const basePages = [
  ["/", "1.0"],
  ["/cabinet.html", "0.9"],
  ["/soins.html", "0.9"],
  ["/equipe.html", "0.8"],
  ["/conseils.html", "0.8"],
  ["/contact.html", "0.9"]
];

const manifest = JSON.parse(await fs.readFile("conseils/manifest.json", "utf8"));
const urls = [
  ...basePages.map(([loc, priority]) => ({ loc: `${siteRoot}${loc}`, priority })),
  ...manifest.map((item) => ({ loc: `${siteRoot}/${item.local}`, priority: "0.7" }))
];

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url>
    <loc>${url.loc}</loc>
    <lastmod>2026-04-26</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${url.priority}</priority>
  </url>`).join("\n")}
</urlset>
`;

await fs.writeFile("sitemap.xml", xml, "utf8");
console.log(`sitemap urls: ${urls.length}`);
