export type DropSource = {
  sourceName: string;
  type: string;
  dropRateRaw?: string;
  dropRateNumeric?: number | null;
  quantity?: string;
  requirements?: string;
  notes?: string;
  wikiUrl?: string;
};

export async function getDropSourcesFor(itemId: number): Promise<DropSource[]> {
  const res = await fetch(`/api/item-drops?itemId=${itemId}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.sources || [];
}