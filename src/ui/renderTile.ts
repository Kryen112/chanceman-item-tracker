export function getIconUrl(icon: string) {
  return `https://oldschool.runescape.wiki/images/${icon.replace(/ /g, "_")}`;
}

export function createTile(item: any, owned: boolean) {
  const tile = document.createElement("div");
  tile.className = "item-tile";
  tile.style.opacity = owned ? "1" : "0.25";

  const img = document.createElement("img");
  img.src = getIconUrl(item.icon);
  img.className = "tile-icon";

  const wiki = document.createElement("img");
  wiki.src = "https://oldschool.runescape.wiki/images/Wiki.png";
  wiki.className = "wiki-button";
  wiki.addEventListener("click", (ev) => {
    ev.stopPropagation();
    const query = encodeURIComponent(item.name.replace(/ /g, "_"));
    window.open(`https://oldschool.runescape.wiki/w/${query}`, "_blank");
  });

  const name = document.createElement("div");
  name.className = "tile-name";
  name.textContent = item.name;

  tile.appendChild(img);
  tile.appendChild(wiki);
  tile.appendChild(name);

  tile.addEventListener("click", () => {
    window.location.href = `item.html?id=${item.id}`;
  });

  return tile;
}
