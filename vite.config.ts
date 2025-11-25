// vite.config.ts
import axios from "axios";
import * as cheerio from "cheerio";
import express from "express";
import { defineConfig, Plugin } from "vite";

type DropSource = {
  sourceName: string;
  type: "monster" | "shop" | "container" | "minigame" | "other";
  dropRateRaw?: string;
  dropRateNumeric?: number | null;
  quantity?: string;
  notes?: string;
  wikiUrl?: string;
};

type ItemDropsResponse = {
  itemId: number;
  itemName: string;
  sources: DropSource[];
  sourceUrl: string;
};

const UA = "ChanceMan-WebProxy/2.0";

// --------------------------
// Mapping cache
// --------------------------
let mappingCache: { id: number; name: string }[] | null = null;

async function loadMapping() {
  if (!mappingCache) {
    const r = await axios.get(
      "https://prices.runescape.wiki/api/v1/osrs/mapping"
    );
    mappingCache = r.data;
  }
  return mappingCache;
}

function itemIdToName(id: number) {
  return mappingCache?.find((x) => x.id === id)?.name || null;
}

function wikiPath(name: string) {
  return name.replace(/ /g, "_");
}

// --------------------------
// Utility: parse numeric rarity
// --------------------------
function parseNumeric(raw: string | undefined): number | null {
  if (!raw) return null;
  raw = raw.replace(/,/g, "").trim();

  // 1/128
  const m = raw.match(/(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)/);
  if (m) return Number(m[1]) / Number(m[2]);

  // 1 in 128
  const m2 = raw.match(/1\s*(?:in|:)\s*(\d+)/i);
  if (m2) return 1 / Number(m2[1]);

  return null;
}

// --------------------------
// Core: Parse Item Page
// --------------------------
function parseItemPage(html: string, itemNameFallback: string) {
  const $ = cheerio.load(html);

  const itemName =
    $("h1#firstHeading").text().trim() || itemNameFallback;

  const sources: DropSource[] = [];

  // -------------------------------------
  // 1. MONSTER / CONTAINER (item-drops tables)
  // -------------------------------------
  $("table.item-drops").each((_, table) => {
    $(table)
      .find("tbody tr")
      .each((_, row) => {
        const tds = $(row).find("td");
        if (tds.length < 2) return;

        const sourceCell = $(tds[0]);

        const sourceName = sourceCell.text().trim();
        if (!sourceName || sourceName === "Nothing") return;

        const quantity = $(tds[1]).text().trim() || undefined;

        // droprate cell may contain nested spans
        let rarity = "";
        const rarityCell = $(tds[2]);
        rarity = rarityCell.attr("data-sort-value") || rarityCell.text().trim();

        const notes =
          $(tds).eq(3).text().trim() || undefined;

        const numeric = parseNumeric(rarity);

        sources.push({
          sourceName,
          type: "monster",
          quantity,
          dropRateRaw: rarity || undefined,
          dropRateNumeric: numeric,
          notes,
          wikiUrl: getLink(sourceCell),
        });
      });
  });

  // -------------------------------------
  // 2. SHOPS (store-locations-list tables)
  // -------------------------------------
  $("table.store-locations-list").each((_, table) => {
    $(table)
      .find("tbody tr")
      .each((_, row) => {
        const tds = $(row).find("td");
        if (tds.length < 1) return;

        const shopCell = $(tds[0]);
        const shopName = shopCell.text().trim();
        if (!shopName) return;

        const stock = $(tds[1]).text().trim() || undefined;

        sources.push({
          sourceName: shopName,
          type: "shop",
          quantity: stock,
          wikiUrl: getLink(shopCell),
        });
      });
  });

  return { itemName, sources };
}

function getLink(cell: cheerio.Cheerio<any>) {
  const href = cell.find("a").attr("href");
  if (!href) return undefined;
  return href.startsWith("/")
    ? "https://oldschool.runescape.wiki" + href
    : href;
}

// --------------------------
// Vite Plugin
// --------------------------
function buildDropsPlugin(): Plugin {
  return {
    name: "item-drops-proxy",
    configureServer(server) {
      const api = express();

      api.get("/item-drops", async (req, res) => {
        try {
          await loadMapping();

          const itemId = Number(req.query.itemId);
          if (!itemId) return res.status(400).json({ error: "Missing itemId" });

          const name = itemIdToName(itemId);
          if (!name) return res.status(404).json({ error: "Unknown itemId" });

          const url = `https://oldschool.runescape.wiki/w/${wikiPath(name)}`;

          const html = await axios.get(url, {
            headers: { "User-Agent": UA },
          });

          const parsed = parseItemPage(html.data, name);

          const response: ItemDropsResponse = {
            itemId,
            itemName: parsed.itemName,
            sources: parsed.sources,
            sourceUrl: url,
          };

          res.json(response);
        } catch (err: any) {
          console.error("Error fetching item drops:", err.message);
          res.status(500).json({ error: "Failed to fetch drops" });
        }
      });

      server.middlewares.use("/api", api);
    },
  };
}

export default defineConfig({
  base: "/chanceman-item-tracker/",
  plugins: [buildDropsPlugin()],
});
