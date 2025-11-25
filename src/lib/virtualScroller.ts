import { createTile } from "../ui/renderTile";

export interface MappingItem {
  id: number;
  name: string;
  icon: string;
}

export type FilterType = "all" | "rolled" | "missing";

const TILE_WIDTH = 60;
const TILE_HEIGHT = 70;
const TILE_GAP = 10;

// persistent tile DOM cache
const tileCache = new Map<number, HTMLElement>();

// lazy-load observer reused forever
let imgObserver: IntersectionObserver | null = null;

export function renderVirtualCollection(
  mapping: MappingItem[],
  unlocked: number[],
  filter: FilterType,
  search: string
): void {
  const collection = document.getElementById("collection") as HTMLElement;

  const rolled = new Set(unlocked);

  const filtered = mapping.filter((item) => {
    if (!item.icon) return false;

    const isRolled = rolled.has(item.id);

    if (filter === "rolled" && !isRolled) return false;
    if (filter === "missing" && isRolled) return false;
    if (search && !item.name.toLowerCase().includes(search)) return false;

    return true;
  });

  filtered.sort((a, b) => a.name.localeCompare(b.name));

  const ITEMS_PER_ROW = Math.floor(window.innerWidth / (TILE_WIDTH + TILE_GAP));
  const total = filtered.length;
  const totalRows = Math.ceil(total / ITEMS_PER_ROW);

  // ensure spacer exists
  let spacer = collection.querySelector(".spacer") as HTMLDivElement | null;
  if (!spacer) {
    spacer = document.createElement("div");
    spacer.className = "spacer";
    spacer.style.position = "relative";
    collection.innerHTML = "";
    collection.appendChild(spacer);
  }

  spacer.style.height = totalRows * (TILE_HEIGHT + TILE_GAP) + "px";

  // ----------------------------
  // Lazy loader (created once)
  // ----------------------------
  if (!imgObserver) {
    imgObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const img = entry.target as HTMLImageElement;
          if (img.dataset.src) {
            img.src = img.dataset.src;
            delete img.dataset.src;
          }
        }
      },
      {
        root: collection,
        rootMargin: "250px",
      }
    );
  }

  // -----------------------------------
  // DOM Recycle Window: no DOM wiping
  // -----------------------------------
  function draw() {
    const scrollTop = collection.scrollTop;
    const viewportHeight = collection.clientHeight;

    const firstRow = Math.floor(scrollTop / (TILE_HEIGHT + TILE_GAP));
    const visibleRows = Math.ceil(viewportHeight / (TILE_HEIGHT + TILE_GAP)) + 1;

    const startIndex = firstRow * ITEMS_PER_ROW;
    const endIndex = Math.min(total, (firstRow + visibleRows) * ITEMS_PER_ROW);

    const seen = new Set<number>();

    for (let i = startIndex; i < endIndex; i++) {
      const item = filtered[i];
      if (!item) continue;

      let tile = tileCache.get(item.id);
      if (!tile) {
        tile = createTile(item, rolled.has(item.id));

        // make icon lazy
        const img = tile.querySelector("img.tile-icon") as HTMLImageElement | null;
        if (img) {
          if (!img.dataset.src) {
            img.dataset.src = img.src;
            img.src = ""; // unload until visible
          }
          imgObserver!.observe(img);
        }

        spacer!.appendChild(tile);
        tileCache.set(item.id, tile);
      }

      // position tile
      const r = Math.floor(i / ITEMS_PER_ROW);
      const c = i % ITEMS_PER_ROW;

      tile.style.position = "absolute";
      tile.style.top = `${r * (TILE_HEIGHT + TILE_GAP)}px`;
      tile.style.left = `${c * (TILE_WIDTH + TILE_GAP)}px`;
      tile.style.display = "block";

      seen.add(item.id);
    }

    // hide tiles that are not visible
    for (const [id, tile] of tileCache) {
      if (!seen.has(id)) {
        tile.style.display = "none";
      }
    }
  }

  collection.onscroll = draw;
  draw();
}
