import { LayloConfigurationError, LayloError } from "./errors.js";
import type { RequestOptions } from "./request-options.js";
import type { CursorPageInfo } from "../types.js";

/** Smallest `limit` the API accepts on a paginated request. */
export const MIN_PAGE_LIMIT = 1;
/** Largest `limit` the API accepts on a paginated request. */
export const MAX_PAGE_LIMIT = 200;

/**
 * The `page_info` object the API returns alongside every paginated collection.
 * An alias of the spec-derived {@link CursorPageInfo}, so it cannot drift from
 * the published contract.
 * @see https://developers.laylo.com/records/cursor-page-info
 */
export type PageInfo = CursorPageInfo;

/**
 * Wire shape of a paginated response: the collection under `data`, keyed by
 * its name, plus `page_info`.
 * @see https://developers.laylo.com/records/cursor-page-info
 */
export interface PageResponse<T, K extends string = string> {
  data: Record<K, T[]>;
  page_info: PageInfo;
}

/**
 * One page of results from a list endpoint. Iterate it with `for await` to walk
 * every page lazily, or read `data` for just the page you asked for.
 * @example
 * ```ts
 * const page = await laylo.conversions.events.list({ limit: 100 });
 *
 * // Just this page
 * console.log(page.data.length, page.hasMore);
 *
 * // Every page, fetched as you go
 * for await (const event of page) {
 *   console.log(event.id);
 * }
 *
 * // Step through manually
 * const next = await page.nextPage();
 *
 * // Collect with a safety cap
 * const first500 = await page.toArray({ maxItems: 500 });
 * ```
 * @see https://developers.laylo.com/records/cursor-page-info
 */
export interface Page<T> extends AsyncIterable<T> {
  /** The items on this page. */
  readonly data: T[];
  /** Whether another page exists after this one. */
  readonly hasMore: boolean;
  /** Cursor for the next page, or `null` when this is the last one. */
  readonly nextCursor: string | null;
  /**
   * The `page_info` object exactly as the API returned it. Non-enumerable, so
   * it stays out of `JSON.stringify` and console output.
   */
  readonly raw: PageInfo;
  /**
   * Fetches the page after this one using the same parameters.
   * @param options Per-call overrides, merged over those used for this page.
   * @returns The next page, or `null` when there isn't one.
   */
  nextPage(options?: RequestOptions): Promise<Page<T> | null>;
  /**
   * Yields every item from this page onward, fetching further pages as needed.
   * Equivalent to iterating the page directly with `for await`.
   * @returns An async iterable over all remaining items.
   */
  autoPaginate(): AsyncIterable<T>;
  /**
   * Collects items from this page onward into a single array.
   * @param options Collection settings.
   * @param options.maxItems Stop after this many items rather than reading
   * every page.
   * @returns The collected items, in order.
   * @throws LayloConfigurationError When `maxItems` is not a positive integer.
   */
  toArray(options?: { maxItems?: number }): Promise<T[]>;
}

/**
 * Re-issues the request that produced a page with a new cursor. Provided by
 * each resource so the page can fetch its successors.
 */
export type FetchPage<T, K extends string = string> = (
  cursor: string,
  options: RequestOptions | undefined,
) => Promise<PageResponse<T, K>>;

/**
 * Checks a `limit` before it is sent so the caller gets a clear error instead
 * of a `400`.
 * @param limit The value to check; `undefined` means "use the API default".
 * @throws LayloConfigurationError When `limit` is not an integer in range.
 */
export const validateLimit = (limit: number | undefined): void => {
  if (limit === undefined) {
    return;
  }
  if (
    typeof limit !== "number" ||
    !Number.isInteger(limit) ||
    limit < MIN_PAGE_LIMIT ||
    limit > MAX_PAGE_LIMIT
  ) {
    throw new LayloConfigurationError(
      `limit must be an integer between ${MIN_PAGE_LIMIT} and ${MAX_PAGE_LIMIT}, got ${String(limit)}`,
    );
  }
};

const validateMaxItems = (maxItems: number | undefined): void => {
  if (maxItems === undefined) {
    return;
  }
  if (
    typeof maxItems !== "number" ||
    !Number.isInteger(maxItems) ||
    maxItems < 1
  ) {
    throw new LayloConfigurationError(
      `maxItems must be a positive integer, got ${String(maxItems)}`,
    );
  }
};

const throwIfAborted = (signal: AbortSignal | undefined): void => {
  if (signal?.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new DOMException("This operation was aborted", "AbortError");
  }
};

const collectionOf = <T, K extends string>(
  response: PageResponse<T, K>,
  collectionKey: K,
): T[] => {
  const items = response.data?.[collectionKey];
  if (!Array.isArray(items)) {
    throw new LayloError(
      `Paginated response is missing the "${collectionKey}" collection`,
    );
  }
  return items;
};

/**
 * Layers `nextPage` overrides onto the options the first page was fetched with.
 * `apiKey` and `creatorId` are mutually exclusive, so an override naming one
 * customer drops the other rather than merging into an object carrying both,
 * which the customer resolver rejects.
 * @param options The options the previous page was fetched with.
 * @param overrides The options passed to `nextPage`.
 * @returns The merged options.
 */
const layerRequestOptions = (
  options: RequestOptions | undefined,
  overrides: RequestOptions,
): RequestOptions => {
  const merged: RequestOptions = { ...options, ...overrides };
  if (overrides.apiKey !== undefined) {
    delete merged.creatorId;
  } else if (overrides.creatorId !== undefined) {
    delete merged.apiKey;
  }
  return merged;
};

/**
 * Wraps a paginated API response in a {@link Page}.
 * @param response The parsed response body.
 * @param collectionKey Name of the array under `data` holding the items.
 * @param fetchNext Re-issues the same request with a different cursor.
 * @param options The per-call overrides the original request was made with;
 * carried to subsequent pages, with anything passed to `nextPage` layered on.
 * @returns The page.
 */
export const createPage = <T, K extends string = string>(
  response: PageResponse<T, K>,
  collectionKey: K,
  fetchNext: FetchPage<T, K>,
  options?: RequestOptions,
): Page<T> => {
  const data = collectionOf(response, collectionKey);
  const pageInfo = response.page_info;
  const hasMore = pageInfo?.has_more === true && pageInfo.next_cursor !== null;
  const nextCursor = hasMore ? pageInfo.next_cursor : null;

  const nextPage = async (
    overrides?: RequestOptions,
  ): Promise<Page<T> | null> => {
    if (nextCursor === null) {
      return null;
    }
    const next =
      overrides === undefined
        ? options
        : layerRequestOptions(options, overrides);
    throwIfAborted(next?.signal);
    return createPage(
      await fetchNext(nextCursor, next),
      collectionKey,
      fetchNext,
      next,
    );
  };

  async function* iterate(): AsyncGenerator<T, void, undefined> {
    let current: Page<T> | null = page;
    while (current !== null) {
      for (const item of current.data) {
        yield item;
      }
      throwIfAborted(options?.signal);
      current = await current.nextPage();
    }
  }

  const toArray = async (opts?: { maxItems?: number }): Promise<T[]> => {
    validateMaxItems(opts?.maxItems);
    const max = opts?.maxItems ?? Infinity;
    const items: T[] = [];
    for await (const item of iterate()) {
      items.push(item);
      if (items.length >= max) {
        break;
      }
    }
    return items;
  };

  const page: Page<T> = {
    data,
    hasMore,
    nextCursor,
    raw: pageInfo,
    nextPage,
    autoPaginate: iterate,
    toArray,
    [Symbol.asyncIterator]: iterate,
  };
  Object.defineProperty(page, "raw", { value: pageInfo, enumerable: false });
  return page;
};
