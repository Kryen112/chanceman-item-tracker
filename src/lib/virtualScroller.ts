import { createTile } from "../ui/renderTile";

const TILE_WIDTH = 60;
const TILE_HEIGHT = 70;
const TILE_GAP = 6;

export function renderVirtualCollection(
  mapping: any[],
  unlocked: number[],
  filter: "all" | "owned" | "missing",
  search: string
) {
  const collection = document.getElementById("collection")!;
  collection.innerHTML = "";

  const ownedSet = new Set(unlocked);

  const filtered = mapping.filter((item) => {
    if (!item.icon) return false;

    const isOwned = ownedSet.has(item.id);

    if (filter === "owned" && !isOwned) return false;
    if (filter === "missing" && isOwned) return false;
    if (search && !item.name.toLowerCase().includes(search)) return false;

    return true;
  });

  filtered.sort((a, b) => a.name.localeCompare(b.name));

  const ITEMS_PER_ROW = Math.floor(window.innerWidth / (TILE_WIDTH + TILE_GAP));
  const total = filtered.length;
  const totalRows = Math.ceil(total / ITEMS_PER_ROW);

  const spacer = document.createElement("div");
  spacer.style.height = totalRows * (TILE_HEIGHT + TILE_GAP) + "px";
  spacer.style.position = "relative";
  collection.appendChild(spacer);

  function draw() {
    const scrollTop = collection.scrollTop;
    const viewportHeight = collection.clientHeight;

    const firstRow = Math.floor(scrollTop / (TILE_HEIGHT + TILE_GAP));
    const visibleRows = Math.ceil(viewportHeight / (TILE_HEIGHT + TILE_GAP)) + 1;

    const startIndex = firstRow * ITEMS_PER_ROW;
    const endIndex = Math.min(total, (firstRow + visibleRows) * ITEMS_PER_ROW);

    spacer.innerHTML = "";

    for (let i = startIndex; i < endIndex; i++) {
      const item = filtered[i];
      const isOwned = ownedSet.has(item.id);

      const tile = createTile(item, isOwned);

      const r = Math.floor(i / ITEMS_PER_ROW);
      const c = i % ITEMS_PER_ROW;

      tile.style.position = "absolute";
      tile.style.top = r * (TILE_HEIGHT + TILE_GAP) + "px";
      tile.style.left = c * (TILE_WIDTH + TILE_GAP) + "px";

      spacer.appendChild(tile);
    }
  }

  collection.onscroll = draw;
  draw();
}
