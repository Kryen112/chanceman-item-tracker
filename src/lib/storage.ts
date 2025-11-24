const STORAGE_KEY = "chanceman_data";

export function loadUnlocked(): number[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveUnlocked(data: number[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
