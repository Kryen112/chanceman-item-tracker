const MAPPING_KEY = "osrs_item_mapping";

export async function loadMapping() {
  const loading = document.getElementById("loading");

  if (loading) loading.style.display = "block";

  const cached = localStorage.getItem(MAPPING_KEY);
  if (cached) {
    if (loading) loading.style.display = "none";
    return JSON.parse(cached);
  }

  const res = await fetch("https://prices.runescape.wiki/api/v1/osrs/mapping");
  const data = await res.json();

  localStorage.setItem(MAPPING_KEY, JSON.stringify(data));

  if (loading) loading.style.display = "none";

  return data;
}
