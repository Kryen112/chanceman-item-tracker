// vite.config.ts
import axios from "axios";
import * as cheerio from "cheerio";
import express from "express";
import fs from "fs";
import path from "path";
import { defineConfig, Plugin } from "vite";

type DropSource = {
  sourceName: string;
  type: string; // "monster" | "thieving" | "skilling" | "container" | "minigame" | "clue" | "other"
  dropRateRaw?: string;
  dropRateNumeric?: number | null; // parsed 1/X as probability (0..1) when possible
  quantity?: string;
  requirements?: string;
  notes?: string;
  wikiUrl?: string;
};

type ItemDropsResponse = {
  itemId: number;
  itemName: string;
  sources: DropSource[];
  sourceUrl?: string;
};

const UA = "ChanceMan-WebProxy/1.0 (your-app)";

// mapping cache key and data
let mappingCache: { id: number; name: string }[] | null = null;
async function loadMapping() {
  if (mappingCache) return mappingCache;
  const res = await axios.get("https://prices.runescape.wiki/api/v1/osrs/mapping");
  mappingCache = res.data;
  return mappingCache!;
}
function itemIdToName(id: number) {
  if (!mappingCache) return null;
  const entry = mappingCache.find((e) => e.id === id);
  return entry?.name ?? null;
}

// utility: sanitize item page path
function itemNameToWikiPath(name: string) {
  return name.replace(/ /g, "_");
}

// parse numeric probability from common patterns like "1/128", "1/128; 1/65", "common", "rare", "5/128", "1/102.4"
function parseDropRateNumeric(raw?: string): number | null {
  if (!raw) return null;
  // try pattern 1/X or 1/X; 1/Y
  const m = raw.match(/(\d+(?:\.\d+)?)\/(\d+(?:,\d{3})*(?:\.\d+)?)/);
  if (m) {
    // e.g. "1/128" or "1/1,092.3"
    const numerator = Number(m[1].replace(",", ""));
    const denom = Number(m[2].replace(/,/g, ""));
    if (!isNaN(numerator) && !isNaN(denom) && denom > 0) {
      return numerator / denom;
    }
  }
  // try "1 in 128" or "1:128"
  const m2 = raw.match(/1(?:\s*in\s*|\s*:\s*)(\d+(?:\.\d+)?)/i);
  if (m2) {
    const denom = Number(m2[1].replace(",", ""));
    if (!isNaN(denom) && denom > 0) return 1 / denom;
  }
  // try single numeric like "5/128" handled above; other textual rarities we cannot parse
  return null;
}

// parse item wiki page and extract relevant source tables
function parseItemPage(html: string, itemName: string): { itemTitle: string; sources: DropSource[] } {
  const $ = cheerio.load(html);

  const itemTitle = $("h1#firstHeading").text().trim() || itemName;

  const sources: DropSource[] = [];

  // Helper: first link inside a table cell
  const getLink = (cell: cheerio.Cheerio<any>) => {
    const href = cell.find("a").attr("href");
    if (!href) return undefined;
    if (href.startsWith("/")) return "https://oldschool.runescape.wiki" + href;
    return href;
  };

  // ------------------------------------------------------
  // 1. MONSTER / CHEST / CONTAINER / MINIGAME DROP SOURCES
  // ------------------------------------------------------
  $("table.item-drops").each((_, table) => {
    const rows = $(table).find("tbody tr");
    rows.each((_, row) => {
      const tds = $(row).find("td");
      if (tds.length < 4) return;

      const sourceName = $(tds[0]).text().trim();
      if (!sourceName || sourceName === "Nothing") return;

      const qty = $(tds[1]).text().trim() || undefined;
      const rarity = $(tds[2]).text().trim() || undefined;
      const notes = $(tds[3]).text().trim() || undefined;

      const dropRateNumeric = parseDropRateNumeric(rarity);

      sources.push({
        sourceName,
        type: "monster",     // Always monster-like for item-drops tables
        quantity: qty,
        dropRateRaw: rarity,
        dropRateNumeric,
        notes,
        wikiUrl: getLink($(tds[0])),
      });
    });
  });

  // -----------------------
  // 2. SHOP TABLES
  // -----------------------
  $("table.store-locations-list").each((_, table) => {
    const rows = $(table).find("tbody tr");
    rows.each((_, row) => {
      const tds = $(row).find("td");
      if (tds.length < 2) return;

      const shopName = $(tds[0]).text().trim();
      const stock = $(tds[1]).text().trim() || undefined;

      sources.push({
        sourceName: shopName,
        type: "shop",
        quantity: stock,
        wikiUrl: getLink($(tds[0])),
      });
    });
  });

  return { itemTitle, sources };
}

// attempt to load local ChanceMan drop files from public/chance_drops
function loadLocalChanceDrops(publicDir: string, itemName: string, itemId: number) : DropSource[] {
  // Expect files like "12212_Moss_giant_42.json" inside public/chance_drops
  try {
    const dropsDir = path.join(publicDir, "chance_drops");
    if (!fs.existsSync(dropsDir)) return [];
    const files = fs.readdirSync(dropsDir);
    const results: DropSource[] = [];
    for (const f of files) {
      try {
        const full = path.join(dropsDir, f);
        const raw = fs.readFileSync(full, "utf-8");
        const json = JSON.parse(raw);
        if (!json.dropTableSections) continue;
        for (const sec of json.dropTableSections) {
          for (const it of sec.items || []) {
            // some ChanceMan files already include itemId (good)
            if (it.itemId === itemId || it.name === itemName) {
              results.push({
                sourceName: json.name || f,
                type: "monster",
                dropRateRaw: it.rarity,
                dropRateNumeric: parseDropRateNumeric(it.rarity),
                quantity: undefined,
                requirements: undefined,
                notes: sec.header,
                wikiUrl: undefined
              });
            }
          }
        }
      } catch {
        // ignore per-file errors
        continue;
      }
    }
    return results;
  } catch {
    return [];
  }
}

function buildDropPlugin(): Plugin {
  return {
    name: "item-drops-proxy",
    configureServer(server) {
      const app = express();
      app.get("/item-drops", async (req, res) => {
        try {
          const itemIdQ = req.query.itemId ?? req.query.id;
          if (!itemIdQ) return res.status(400).json({ error: "Missing ?itemId=" });
          const itemId = Number(itemIdQ);
          if (isNaN(itemId)) return res.status(400).json({ error: "Invalid itemId" });

          const cacheKey = `item_${itemId}`;
          // server-side in-process cache
          (server as any).itemDropsCache = (server as any).itemDropsCache ?? new Map();
          const serverCache: Map<string, ItemDropsResponse> = (server as any).itemDropsCache;

          if (serverCache.has(cacheKey)) {
            return res.json(serverCache.get(cacheKey));
          }

          // ensure mapping is loaded
          await loadMapping();
          const itemName = itemIdToName(itemId) ?? `Item_${itemId}`;
          const wikiPath = itemNameToWikiPath(itemName);
          const url = `https://oldschool.runescape.wiki/w/${wikiPath}`;

          // fetch page
          const html = await axios.get(url, { headers: { "User-Agent": UA } }).then(r => r.data);

          // parse page
          const { sources, itemTitle } = parseItemPage(html, itemName);

          // merge local ChanceMan drops if present
          const publicDir = server.config?.root ? server.config.root : process.cwd();
          const localDrops = loadLocalChanceDrops(publicDir, itemTitle, itemId);

          // combine and deduplicate by sourceName + type + dropRateRaw
          const combined = [...localDrops, ...sources];
          const deduped: ItemDropsResponse = {
            itemId,
            itemName: itemTitle,
            sources: []
          };
          const seen = new Set<string>();
          for (const s of combined) {
            const key = `${s.sourceName}|${s.type}|${s.dropRateRaw ?? ""}`;
            if (seen.has(key)) continue;
            seen.add(key);
            deduped.sources.push(s);
          }

          deduped.sourceUrl = url;
          serverCache.set(cacheKey, deduped);

          return res.json(deduped);
        } catch (err: any) {
          console.error("item-drops proxy error:", err && err.message ? err.message : err);
          return res.status(500).json({ error: "Failed to fetch item drops" });
        }
      });

      // mount at /api
      server.middlewares.use("/api", app);
    }
  };
}

export default defineConfig({
  base: "/chanceman-item-tracker/",
  plugins: [buildDropPlugin()]
});
