import axios from "axios";
import * as cheerio from "cheerio";
import cors from "cors";
import express from "express";

const app = express();
app.use(cors());

const UA = "ChanceMan-WebProxy/1.0";

function buildUrl(itemId, name) {
  let url = "https://oldschool.runescape.wiki/w/Special:Lookup?type=item";

  if (itemId) url += `&id=${itemId}`;
  if (name) {
    const safe = encodeURIComponent(name.replace(/ /g, "_"));
    url += `&name=${safe}`;
  }

  return url;
}

async function fetchHtml(url) {
  const res = await axios.get(url, {
    headers: { "User-Agent": UA },
  });
  return res.data;
}

//
// ----------------------------------------------------------
// PARSE DROP SOURCES   (table.item-drops)
// ----------------------------------------------------------
//
function parseDropSources($) {
  const results = [];

  const tables = $("table.item-drops");

  tables.each((_, table) => {
    const $table = $(table);

    // Ignore unintentional tables (we don't need extra checks because .item-drops is unique)
    $table.find("tbody > tr").each((_, row) => {
      const tds = $(row).find("td");
      if (tds.length < 4) return;

      const sourceName = $(tds[0]).text().trim();
      const qty = $(tds[1]).text().trim();
      const rarityRaw = $(tds[2]).text().trim();
      const notes = $(tds[3]).text().trim();
      const link = getFirstLink($(tds[0]));

      // Skip ground spawns
      if (/spawn|ground/i.test(sourceName)) return;

      let dropRateNumeric = null;
      if (/^\d+\/\d+$/.test(rarityRaw)) {
        const [a, b] = rarityRaw.split("/").map(Number);
        dropRateNumeric = a / b;
      }

      results.push({
        sourceName,
        quantity: qty || null,
        dropRateRaw: rarityRaw || null,
        dropRateNumeric,
        notes: notes || null,
        wikiUrl: link || null,
      });
    });
  });

  return results;
}

//
// ----------------------------------------------------------
// PARSE SHOPS   (table.store-locations-list)
// ----------------------------------------------------------
//
function parseShopSources($) {
  const results = [];

  const shopTables = $("table.store-locations-list");

  shopTables.each((_, table) => {
    const $table = $(table);

    $table.find("tbody > tr").each((_, row) => {
      const tds = $(row).find("td");
      if (tds.length < 5) return;

      const shopName = $(tds[0]).text().trim();
      const location = $(tds[1]).text().trim();
      const stock = $(tds[2]).text().trim();
      const restockTime = $(tds[3]).text().trim();
      const price = $(tds[4]).text().trim();
      const link = getFirstLink($(tds[0]));

      results.push({
        shopName,
        location,
        stock,
        restockTime,
        price,
        wikiUrl: link || null,
      });
    });
  });

  return results;
}

//
// ----------------------------------------------------------
// Helper
// ----------------------------------------------------------
//
function getFirstLink(cell) {
  const href = cell.find("a").attr("href");
  if (!href) return null;
  return "https://oldschool.runescape.wiki" + href;
}

//
// ----------------------------------------------------------
// API ROUTE
// ----------------------------------------------------------
//
app.get("/drops", async (req, res) => {
  try {
    const { id, item } = req.query;
    if (!id && !item) {
      return res.status(400).json({ error: "Missing ?id= or ?item=" });
    }

    const url = buildUrl(id, item);
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);

    const itemName = $("h1#firstHeading").text().trim();

    const drops = parseDropSources($);
    const shops = parseShopSources($);

    res.json({
      itemId: Number(id),
      itemName,
      drops,
      shops,
      sourceUrl: url,
    });
  } catch (err) {
    console.error("Drop proxy error :", err.message);
    res.status(500).json({ error: "Failed to fetch drops" });
  }
});

app.listen(5174, () => {
  console.log("Drop proxy running on http://localhost:5174");
});
