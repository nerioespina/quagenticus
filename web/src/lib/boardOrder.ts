/**
 * Given the final ordered ids of a column after a drop, returns the neighbours
 * the backend needs: before_id = card above, after_id = card below.
 */
export function neighbours(orderedIds: string[], movedId: string): { before_id?: string; after_id?: string } {
  const idx = orderedIds.indexOf(movedId);
  if (idx < 0) return {};
  return {
    before_id: idx > 0 ? orderedIds[idx - 1] : undefined,
    after_id: idx < orderedIds.length - 1 ? orderedIds[idx + 1] : undefined,
  };
}

export function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  const copy = arr.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}
