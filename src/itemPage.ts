import { getDropSourcesFor } from "./lib/drops";
import { loadMapping } from "./lib/mapping";
import { renderDropSources } from "./ui/dropList";
import { getIconUrl } from "./ui/renderTile";

const params = new URLSearchParams(window.location.search);
const id = Number(params.get("id"));

const nameEl = document.getElementById("itemName")!;
const iconEl = document.getElementById("itemIcon")! as HTMLImageElement;
const wikiEl = document.getElementById("wikiLink")!;
const sourceContainer = document.getElementById("sourceInfo")!;

(async () => {
  const mapping = await loadMapping();
  const item = mapping.find((m: any) => m.id === id);

  if (!item) {
    nameEl.textContent = "Item not found";
    return;
  }

  nameEl.textContent = item.name;
  iconEl.src = getIconUrl(item.icon);

  const wikiName = encodeURIComponent(item.name.replace(/ /g, "_"));
  wikiEl.innerHTML = `
    <a href="https://oldschool.runescape.wiki/w/${wikiName}" target="_blank">
      <img src="https://oldschool.runescape.wiki/images/Wiki.png" class="wiki-icon" />
      Open Wiki Page
    </a>
  `;

  // Drop sources (now uses the new /api/item-drops endpoint)
  const resp = await getDropSourcesFor(id);
  renderDropSources(sourceContainer, resp, true);
})();
