export const currentFilter = { value: "all" as "all" | "owned" | "missing" };
export const currentSearch = { value: "" };

export function setupFilters(callback: () => void) {
  // search
  const search = document.getElementById("search") as HTMLInputElement;
  search.addEventListener("input", () => {
    currentSearch.value = search.value.toLowerCase();
    callback();
  });

  // filter buttons
  document.querySelectorAll("[data-filter]").forEach((btn) => {
    const element = btn as HTMLButtonElement;
    element.addEventListener("click", () => {
      currentFilter.value = element.dataset.filter as any;
      callback();
    });
  });
}
