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
function parseItemPage(html: string, itemName: string): { sources: DropSource[]; itemTitle: string } {
  const $ = cheerio.load(html);
  const itemTitle = $("h1#firstHeading").text().trim() || itemName;
  const sources: DropSource[] = [];

  // Helper: build wiki link for a source row (when a link exists in the row)
  function extractLinkFromCell(cell: cheerio.Cheerio<any>): string | undefined {
    const a = cell.find("a").first();
    if (a && a.attr("href")) {
      const href = a.attr("href")!;
      if (href.startsWith("/")) return "https://oldschool.runescape.wiki" + href;
      if (href.startsWith("http")) return href;
    }
    return undefined;
  }

  // 1) Standard "Drop sources" or "Sources" tables (class item-drops or wikitable)
  // We will search for headings that likely indicate source tables and parse the nearest table(s).
  const sectionSelectors = [
    "h2:has(span#Drop_sources)",
    "h2:has(span#Sources)",
    "h2:has(span#Item_sources)",
    "h2:has(span#Obtained_from)",
    "h2:has(span#Sources_and_locations)",
    "h2" // fallback: parse all h2 and examine tables under them
  ];

  // Utility to parse a generic "sources" table row into DropSource
  function parseSourceRow($row: cheerio.Cheerio<any>) : DropSource | null {
    // Many source tables have multiple columns: Source | Location/Method | Rate | Notes/Reqs
    const cols = $row.find("td, th");
    if (cols.length === 0) return null;

    // Try to heuristically find source name, rate, quantity, requirements/notes
    const colTexts = cols.map((i, el) => $(el).text().trim()).get();
    // Identify probable sourceName: often first column
    const sourceName = (colTexts[0] || "").replace(/\s+/g, " ").trim();
    if (!sourceName) return null;

    // find rate: look for a cell that looks like a rate (contains '/', '1/', '%', 'chance', 'rare', 'common', 'uncommon')
    let rawRate: string | undefined;
    for (let i = 0; i < colTexts.length; i++) {
      const txt = colTexts[i].toLowerCase();
      if (txt.includes("/") || txt.includes("%") || /chance|chance to|rare|common|uncommon|1 in|1\/|drop/.test(txt)) {
        rawRate = colTexts[i];
        break;
      }
    }

    // quantity: sometimes in same cell as rate or in a dedicated column; we try simple heuristics
    let quantity: string | undefined;
    const qMatch = (colTexts.join(" ")).match(/x?\s?(\d+–\d+|\d+)\b/);
    if (qMatch) quantity = qMatch[1];

    // requirements/notes: last column(s)
    const notes = colTexts.slice(1).join(" | ").trim() || undefined;

    // Determine type heuristically by sourceName or table context
    let type = "other";
    const s = sourceName.toLowerCase();
    if (/pickpocket|pickpocketing|stall|thieving/.test(s)) type = "thieving";
    else if (/barrows|minigame|gauntlet|raids|treasure trails|treasure trail|clue/.test(s)) type = "minigame";
    else if (/fish|fishing|harpoon|net|fishing spot|mining|mine|ore|woodcut|log|chop|farm|skilling/.test(s)) type = "skilling";
    else if (/chest|cupboard|crate|drawer|shelf|coffin|box|altar|trough|chest|container/i.test(sourceName)) type = "container";
    else if (/npc|monster|boss|guard|shade|giant|dragon|rabbit|rat|goblin|man|woman|demon|zombie|skeleton/i.test(sourceName)) type = "monster";
    else if (/clue|casket|treasure trail/i.test(notes || "")) type = "clue";

    const parsedNumeric = parseDropRateNumeric(rawRate);
    const link = extractLinkFromCell(cols.eq(0));
    return {
      sourceName,
      type,
      dropRateRaw: rawRate,
      dropRateNumeric: parsedNumeric,
      quantity,
      requirements: undefined,
      notes: notes || undefined,
      wikiUrl: link
    };
  }

  // Iterate h2/h3 sections and parse tables present under them
  $("h2, h3").each((_, h) => {
    const heading = $(h).text().trim();
    // examine subsequent sibling nodes until next heading at same level
    let el = $(h).next();
    let collectedTables: any = [];
    while (el.length && el[0].tagName !== "h2" && el[0].tagName !== "h3") {
      if (el[0].tagName === "table" || el.find("table").length > 0) {
        // push tables directly or inner tables
        if (el[0].tagName === "table") collectedTables.push(el[0]);
        else el.find("table").each((i, t) => collectedTables.push(t));
      }
      el = el.next();
    }

    for (const tEl of collectedTables) {
      const $t = $(tEl);
      // only parse tables that look like source/drop tables
      const tblClass = $t.attr("class") || "";
      if (!/item-drops|wikitable|infobox|itemsources|item-drop-table/i.test(tblClass) && $t.find("tbody tr").length === 0) continue;

      $t.find("tbody tr").each((i, row) => {
        const ds = parseSourceRow($(row));
        if (ds) {
          // attach type hint using heading if available
          if (/Drop sources|Drops|Monster drops/i.test(heading)) ds.type = "monster";
          if (/Thieving|Pickpocketing|Stalls/i.test(heading)) ds.type = "thieving";
          if (/Clue|Treasure Trails|Casket/i.test(heading)) ds.type = "clue";
          if (/Chest|Cupboard|Drawer|Container/i.test(heading)) ds.type = "container";
          sources.push(ds);
        }
      });
    }
  });

  // fallback: look for specific item-drops tables anywhere on page
  $("table.item-drops, table.wikitable").each((_, t) => {
    $(t).find("tbody tr").each((i, row) => {
      const ds = parseSourceRow($(row));
      if (ds) sources.push(ds);
    });
  });

  return { sources, itemTitle };
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
