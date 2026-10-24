/** Reading one page of a set of saved ids -- a list, or what the reader rated.
 *  The ids and what only the reader knows about them (when they were saved,
 *  how they were rated) come from the user service; what the items are comes
 *  from the read API. So drawing one page is two steps:
 *
 *    - An order the user service owns (added, rating, rated): it orders and
 *      pages the ids itself, and the read API fills in that page.
 *    - An order of the read API's (title, release date, ...): every id goes to
 *      it in one request and it orders and pages them, so those orders are not
 *      offered once the set is too long for that.
 *
 *  A search is the read API's either way; under an order of the user service's
 *  it only says which ids match, and the page is cut from those in order. */

import { list as query } from './api';
import { LIST, PAGE_SIZE, type Sort } from './list';
import type { GoneRow } from './types';
import type { OwnOrder } from './user';

/** An order the user service owns. `value` is what the address says and must
 *  not be one of the read API's (it has a "rating" of its own); `by` is what
 *  the service calls it. */
export interface OwnSort extends Sort {
  by: string;
}

/** A saved id and the reader's rating of it, if any. */
export interface Owned {
  id: string;
  rating: number | null;
}

/** Where the ids come from. Both take an order of the service's own. */
export interface ShelfSource {
  page(order: OwnOrder, page: number, limit: number): Promise<{ rows: Owned[]; count: number }>;
  /** Every id, or fewer than `count` when the set is too long to hand over. */
  all(order: OwnOrder): Promise<{ items: Owned[]; count: number }>;
}

export interface ShelfPage {
  rows: { id: string }[];
  count: number;
  ratings: Map<string, number>;
  /** Saved ids the read API no longer has, which its orders leave out. */
  missing: number;
  /** Too long for one read API request, so only the service's orders work. */
  tooBig: boolean;
}

export async function readShelf({
  type,
  source,
  own,
  sort,
  reverse,
  search,
  page,
}: {
  type: string;
  source: ShelfSource;
  /** The service's own orders, the default first. */
  own: OwnSort[];
  sort: string;
  reverse: boolean;
  search: string;
  page: number;
}): Promise<ShelfPage> {
  const spec = LIST[type];
  const ownSort = own.find(s => s.value === sort);

  const hydrate = async (owned: Owned[]) => {
    if (owned.length === 0) return [];
    // No limit: an id lookup without one returns every row it names, and a
    // limit the length of a long list would be over the page size ceiling.
    const answer = await query<{ id: string }>(spec.type, {
      fields: spec.fields,
      filters: { id: owned.map(o => o.id).join(',') },
    });
    const byId = new Map(answer.results.map(r => [r.id, r]));
    return owned.map(o => byId.get(o.id) ?? goneRow(o.id));
  };
  const rated = (owned: Owned[]) =>
    new Map(owned.filter(o => o.rating !== null).map(o => [o.id, o.rating!]));
  const ownDefault: OwnOrder = { sort: own[0].by, ascending: false };
  const order: OwnOrder = ownSort ? { sort: ownSort.by, ascending: !reverse } : ownDefault;

  if (ownSort && !search) {
    const got = await source.page(order, page, PAGE_SIZE);
    return {
      rows: await hydrate(got.rows),
      count: got.count,
      ratings: rated(got.rows),
      missing: 0,
      tooBig: false,
    };
  }

  const whole = await source.all(order);
  if (whole.items.length < whole.count) {
    // Fall back rather than order or search only part of the set.
    const got = await source.page(ownDefault, page, PAGE_SIZE);
    return {
      rows: await hydrate(got.rows),
      count: got.count,
      ratings: rated(got.rows),
      missing: 0,
      tooBig: true,
    };
  }
  if (whole.items.length === 0) {
    return { rows: [], count: 0, ratings: new Map(), missing: 0, tooBig: false };
  }
  const ids = whole.items.map(o => o.id).join(',');

  if (ownSort) {
    // The read API says which match; the order stays the service's.
    const found = await query<{ id: string }>(spec.type, {
      fields: 'id',
      filters: { id: ids, search },
    });
    const hit = new Set(found.results.map(r => r.id));
    const kept = whole.items.filter(o => hit.has(o.id));
    const shown = kept.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    return {
      rows: await hydrate(shown),
      count: kept.length,
      ratings: rated(kept),
      missing: 0,
      tooBig: false,
    };
  }

  const answer = await query<{ id: string }>(spec.type, {
    fields: spec.fields,
    page,
    limit: PAGE_SIZE,
    sort,
    reverse,
    filters: { id: ids, ...(search ? { search } : {}) },
  });
  // Without a search every saved id the read API still has is counted, so
  // the shortfall is what it no longer has.
  const missing = search ? 0 : whole.items.length - answer.count;
  return {
    rows: answer.results,
    count: answer.count,
    ratings: rated(whole.items),
    missing,
    tooBig: false,
  };
}

function goneRow(id: string): GoneRow {
  return { id, gone: true };
}
