/** Move the item at `index` by `delta` places, clamped to the list. Returns a new array. */
export function moveItem<T>(items: readonly T[], index: number, delta: number): T[] {
  const next = [...items];
  if (index < 0 || index >= items.length) return next;
  const target = Math.min(items.length - 1, Math.max(0, index + delta));
  if (target === index) return next;
  const [item] = next.splice(index, 1);
  if (item === undefined) return next;
  next.splice(target, 0, item);
  return next;
}
