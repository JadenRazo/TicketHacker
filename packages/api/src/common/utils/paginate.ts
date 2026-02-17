export function paginateResult<T extends { id: string }>(
  items: T[],
  limit: number,
): { data: T[]; nextCursor: string | null } {
  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore ? data[data.length - 1].id : null;
  return { data, nextCursor };
}
