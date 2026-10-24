// Cursor pagination: lists return `{ data, next_cursor }`; pass `next_cursor`
// back as `cursor` until it is null.

/** One page of a list. */
export interface Page<T> {
  data: T[];
  next_cursor?: string | null;
}

/**
 * Yields every item of every page, fetching the next page only when the
 * caller gets that far. Stops at a null cursor, or at a cursor already seen.
 */
export async function* paginate<T>(
  fetchPage: (cursor: string | undefined) => Promise<Page<T>>,
  startCursor?: string | null,
): AsyncGenerator<T, void, undefined> {
  let cursor = startCursor ?? undefined;
  const seen = new Set<string>();
  for (;;) {
    const page = await fetchPage(cursor);
    for (const item of page.data ?? []) yield item;
    const next = page.next_cursor;
    if (!next || seen.has(next)) return;
    seen.add(next);
    cursor = next;
  }
}
