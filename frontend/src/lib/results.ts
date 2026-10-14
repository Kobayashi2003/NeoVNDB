/** Fetches a search page apart from drawing it, so the page can place the
 *  count and the rows separately. */

import { ApiError, list } from '@/lib/api';
import { one, type Params } from '@/lib/href';
import { LIST, PAGE_SIZE } from '@/lib/list';

export interface Results {
  rows: unknown[];
  count: number;
  page: number;
  sort: string;
  reverse: boolean;
  /** Set when the request was invalid, as opposed to matching nothing. */
  failure: string | null;
}

export async function fetchResults(
  type: string,
  params: Params,
  filters: Record<string, string>,
  /** Overrides the type's default sort (the front page sorts by date). */
  fallbackSort?: string,
): Promise<Results> {
  const spec = LIST[type];
  const page = Math.max(1, Number(one(params, 'page') ?? 1) || 1);
  const search = filters.search ?? '';

  const sort = one(params, 'sort') ?? (search ? 'searchrank' : (fallbackSort ?? spec.defaultSort));

  // Each sort has its own default direction.
  const chosen = one(params, 'reverse');
  const reverse =
    chosen !== undefined
      ? chosen === 'true'
      : sort === 'searchrank' || (spec.sorts.find(s => s.value === sort)?.descending ?? false);

  try {
    const answer = await list<unknown>(spec.type, {
      fields: spec.fields,
      page,
      limit: PAGE_SIZE,
      sort,
      reverse,
      filters,
    });
    return { rows: answer.results, count: answer.count, page, sort, reverse, failure: null };
  } catch (e) {
    // Only 400 messages are meant for the reader.
    const failure = e instanceof ApiError && e.status === 400 ? e.message : 'Something went wrong.';
    return { rows: [], count: 0, page, sort, reverse, failure };
  }
}

/** Row count only, for tab labels. */
export async function countOf(type: string, filters: Record<string, string>): Promise<number> {
  try {
    const answer = await list<unknown>(LIST[type].type, { fields: 'id', limit: 1, filters });
    return answer.count;
  } catch {
    return 0;
  }
}
