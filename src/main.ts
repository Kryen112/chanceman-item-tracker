import { currentFilter, currentSearch, setupFilters } from "./lib/filters";
import { loadMapping } from "./lib/mapping";
import { loadUnlocked, saveUnlocked } from "./lib/storage";
import { renderVirtualCollection } from "./lib/virtualScroller";

let unlockedIds = loadUnlocked();

const fileInput = document.getElementById("fileInput") as HTMLInputElement;
const statusEl = document.getElementById("status") as HTMLParagraphElement;

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  try {
    const json = JSON.parse(await file.text());
    unlockedIds = json;
    saveUnlocked(json);
    statusEl.textContent = "File loaded!";
    run();
  } catch {
    statusEl.textContent = "Invalid file.";
  }
});

setupFilters(() => run());

async function run() {
  const mapping = await loadMapping();
  renderVirtualCollection(mapping, unlockedIds, currentFilter.value, currentSearch.value);
}

// initial load:
run();
