// src/ui/dropList.ts
import type { DropSource } from "../lib/drops";

function formatPercent(p?: number | null) {
  if (!p && p !== 0) return "";
  return (p * 100).toFixed(3) + "%";
}

export function renderDropSources(container: HTMLElement, drops: DropSource[], accessible = true) {
  container.innerHTML = "";
  if (!drops || drops.length === 0) {
    container.innerHTML = "<div>No known sources on the wiki.</div>";
    return;
  }

  // sort by numeric probability descending (higher chance first). If no numeric, push to end.
  drops.sort((a, b) => {
    const an = a.dropRateNumeric ?? -1;
    const bn = b.dropRateNumeric ?? -1;
    if (an === bn) return (a.sourceName || "").localeCompare(b.sourceName);
    return bn - an;
  });

  for (const d of drops) {
    const row = document.createElement("div");
    row.style.padding = "8px";
    row.style.borderBottom = "1px solid #222";
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.alignItems = "center";

    const left = document.createElement("div");
    left.style.flex = "1";

    const title = document.createElement("div");
    title.innerHTML = `<strong>${d.sourceName}</strong> <small style="color:#aaa">(${d.type})</small>`;
    left.appendChild(title);

    const meta = document.createElement("div");
    meta.style.color = "#bbb";
    meta.style.fontSize = "12px";
    meta.innerText = `${d.dropRateRaw ?? ""} ${d.quantity ? `· qty: ${d.quantity}` : ""} ${d.requirements ? `· reqs: ${d.requirements}` : ""}`;
    left.appendChild(meta);

    const right = document.createElement("div");
    right.style.textAlign = "right";
    right.style.minWidth = "120px";

    const pct = document.createElement("div");
    pct.style.fontSize = "12px";
    pct.style.color = "#fff";
    pct.textContent = d.dropRateNumeric ? formatPercent(d.dropRateNumeric) : (d.dropRateRaw ?? "");
    right.appendChild(pct);

    if (d.wikiUrl) {
      const link = document.createElement("a");
      link.href = d.wikiUrl;
      link.target = "_blank";
      link.style.display = "inline-block";
      link.style.marginLeft = "8px";
      link.textContent = "wiki";
      right.appendChild(link);
    }

    row.appendChild(left);
    row.appendChild(right);

    container.appendChild(row);
  }
}
