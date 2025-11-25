// src/ui/dropList.ts
import type { DropSource } from "../lib/drops";

function formatPercent(p?: number | null) {
  if (!p && p !== 0) return "";
  return (p * 100).toFixed(2) + "%";
}

// Determine wiki-like rarity color
function getRateColor(raw?: string, numeric?: number | null): string {
  if (!raw && numeric == null) return "#ddd";

  // Guaranteed
  if (raw?.trim() === "Always" || numeric === 1) return "#ffffff";

  // Numeric rarity estimation
  if (numeric != null) {
    if (numeric > 1 / 20) return "#3aff3a"; // common (green)
    if (numeric > 1 / 100) return "#ffaa2b"; // uncommon (orange)
    if (numeric > 1 / 512) return "#ff4444"; // rare (red)
    return "#b660ff"; // very rare (purple)
  }

  // Text-based fallback
  const r = raw!.toLowerCase();
  if (r.includes("common")) return "#3aff3a";
  if (r.includes("uncommon")) return "#ffaa2b";
  if (r.includes("rare")) return "#ff4444";
  if (r.includes("very rare") || r.includes("ultra")) return "#b660ff";

  return "#ddd";
}

// Small section header
function makeSection(title: string) {
  const h = document.createElement("div");
  h.style.fontSize = "15px";
  h.style.fontWeight = "bold";
  h.style.margin = "16px 0 8px";
  h.style.color = "#ccc";
  h.textContent = title;
  return h;
}

export function renderDropSources(
  container: HTMLElement,
  drops: DropSource[],
  accessible = true
) {
  container.innerHTML = "";

  if (!drops || drops.length === 0) {
    container.innerHTML = "<div>No known sources on the wiki.</div>";
    return;
  }

  // Group by type
  const byType: Record<string, DropSource[]> = {};
  for (const d of drops) {
    if (!byType[d.type]) byType[d.type] = [];
    byType[d.type].push(d);
  }

  // Sort within groups by drop rate (highest chance first)
  const sortDrops = (arr: DropSource[]) =>
    arr.sort((a, b) => {
      const an = a.dropRateNumeric ?? -1;
      const bn = b.dropRateNumeric ?? -1;
      if (an === bn)
        return (a.sourceName || "").localeCompare(b.sourceName);
      return bn - an;
    });

  const order = ["monster", "shop", "container", "thieving", "minigame", "skilling", "clue", "other"];

  for (const type of order) {
    const list = byType[type];
    if (!list || list.length === 0) continue;

    // Section header
    container.appendChild(makeSection(
      type === "monster" ? "Monster Drops" :
      type === "shop" ? "Shops" :
      type === "container" ? "Containers" :
      type[0].toUpperCase() + type.slice(1)
    ));

    for (const d of sortDrops(list)) {
      const row = document.createElement("div");
      row.style.padding = "10px 8px";
      row.style.marginBottom = "4px";
      row.style.border = "1px solid #222";
      row.style.borderRadius = "4px";
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "center";
      row.style.background = accessible ? "#111" : "#1116"; // faded if not accessible

      const left = document.createElement("div");
      left.style.flex = "1";

      const title = document.createElement("div");
      title.innerHTML = `<strong>${d.sourceName}</strong>`;
      left.appendChild(title);

      const meta = document.createElement("div");
      meta.style.color = "#aaa";
      meta.style.fontSize = "12px";

      const qtyTxt = d.quantity ? ` qty: ${d.quantity}` : "";
      const notesTxt = d.requirements ? ` reqs: ${d.requirements}` : "";
      meta.innerText = `${d.dropRateRaw ?? ""}${qtyTxt}${notesTxt}`;
      left.appendChild(meta);

      const right = document.createElement("div");
      right.style.textAlign = "right";
      right.style.minWidth = "120px";

      const pct = document.createElement("div");
      pct.style.fontSize = "13px";
      const color = getRateColor(d.dropRateRaw, d.dropRateNumeric);
      console.log(color);

      pct.style.color = color;
      pct.textContent =
        d.dropRateNumeric != null
          ? formatPercent(d.dropRateNumeric)
          : d.dropRateRaw ?? "";
      console.log(pct.textContent =
        d.dropRateNumeric != null
          ? formatPercent(d.dropRateNumeric)
          : d.dropRateRaw ?? "");
      right.appendChild(pct);

      if (d.wikiUrl) {
        const link = document.createElement("a");
        link.href = d.wikiUrl;
        link.target = "_blank";
        link.style.display = "inline-block";
        link.style.marginTop = "4px";
        link.style.fontSize = "12px";
        link.style.color = "#9370ff";
        link.textContent = "wiki";
        right.appendChild(link);
      }

      row.appendChild(left);
      row.appendChild(right);
      container.appendChild(row);
    }
  }
}
