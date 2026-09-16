import { describe, expect, it, vi } from "vitest";

import { LayloConfigurationError, LayloError, ServerError } from "../errors.js";
import {
  createPage,
  type FetchPage,
  type PageResponse,
  validateLimit,
} from "../pagination.js";
import type { RequestOptions } from "../request-options.js";

type Item = { id: number };

const response = <K extends string>(
  key: K,
  ids: number[],
  next: string | null,
): PageResponse<Item, K> =>
  ({
    data: { [key]: ids.map((id) => ({ id })) },
    page_info: { has_more: next !== null, next_cursor: next },
  }) as PageResponse<Item, K>;

// Serves pages by cursor; the first page is handed to createPage directly.
const source = <K extends string>(
  pages: Record<string, PageResponse<Item, K> | Error>,
) => {
  const calls: Array<{ cursor: string; options: RequestOptions | undefined }> =
    [];
  const fetchNext: FetchPage<Item, K> = vi.fn(
    (cursor: string, options: RequestOptions | undefined) => {
      calls.push({ cursor, options });
      const next = pages[cursor];
      if (next === undefined) {
        return Promise.reject(new Error(`unexpected cursor ${cursor}`));
      }
      return next instanceof Error
        ? Promise.reject(next)
        : Promise.resolve(next);
    },
  );
  return { fetchNext, calls };
};

const ids = (items: Item[]) => items.map((i) => i.id);

describe("createPage", () => {
  it("exposes camel-cased page info and hides the raw wire shape", () => {
    const page = createPage(
      response("events", [1, 2], "c1"),
      "events",
      source({}).fetchNext,
    );
    expect(ids(page.data)).toEqual([1, 2]);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBe("c1");
    expect(page.raw).toEqual({ has_more: true, next_cursor: "c1" });
    expect(Object.keys(page)).not.toContain("raw");
    expect(JSON.parse(JSON.stringify(page))).not.toHaveProperty("raw");
  });

  it("treats has_more without a cursor as the last page", () => {
    const page = createPage(
      {
        data: { events: [] },
        page_info: { has_more: true, next_cursor: null },
      },
      "events",
      source({}).fetchNext,
    );
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it("throws a LayloError when the collection key is missing from the response", () => {
    const make = () =>
      createPage(
        response("events", [1], null),
        "fans" as unknown as "events",
        source({}).fetchNext,
      );
    expect(make).toThrow(LayloError);
    expect(make).toThrow(/"fans" collection/);
  });
});

describe("autoPaginate", () => {
  it("yields every item in order across pages and passes cursors verbatim", async () => {
    const { fetchNext, calls } = source({
      c1: response("events", [3, 4], null),
    });
    const page = createPage(
      response("events", [1, 2], "c1"),
      "events",
      fetchNext,
    );

    const seen: number[] = [];
    for await (const item of page) {
      seen.push(item.id);
    }

    expect(seen).toEqual([1, 2, 3, 4]);
    expect(calls.map((c) => c.cursor)).toEqual(["c1"]);
    expect(fetchNext).toHaveBeenCalledTimes(1);
  });

  it("ends after the first page when has_more is false", async () => {
    const { fetchNext } = source({});
    const page = createPage(response("events", [1], null), "events", fetchNext);

    const seen = [];
    for await (const item of page.autoPaginate()) {
      seen.push(item.id);
    }

    expect(seen).toEqual([1]);
    expect(fetchNext).not.toHaveBeenCalled();
  });

  it("stops fetching once the caller aborts", async () => {
    const controller = new AbortController();
    const { fetchNext } = source({
      c1: response("events", [2], "c2"),
      c2: response("events", [3], null),
    });
    const page = createPage(
      response("events", [1], "c1"),
      "events",
      fetchNext,
      { signal: controller.signal },
    );

    const seen: number[] = [];
    await expect(async () => {
      for await (const item of page) {
        seen.push(item.id);
        if (item.id === 2) {
          controller.abort();
        }
      }
    }).rejects.toMatchObject({ name: "AbortError" });

    expect(seen).toEqual([1, 2]);
    expect(fetchNext).toHaveBeenCalledTimes(1);
  });

  it("propagates an error from a later page out of the for-await", async () => {
    const failure = new ServerError({
      status: 500,
      code: "INTERNAL",
      message: "boom",
      headers: new Headers(),
      raw: undefined,
    });
    const { fetchNext } = source({ c1: failure });
    const page = createPage(response("events", [1], "c1"), "events", fetchNext);

    const seen: number[] = [];
    await expect(async () => {
      for await (const item of page) {
        seen.push(item.id);
      }
    }).rejects.toBe(failure);
    expect(seen).toEqual([1]);
  });

  it("works identically for a different collection key", async () => {
    const { fetchNext, calls } = source({ f1: response("fans", [2], null) });
    const page = createPage(response("fans", [1], "f1"), "fans", fetchNext);

    expect(ids(await page.toArray())).toEqual([1, 2]);
    expect(calls.map((c) => c.cursor)).toEqual(["f1"]);
  });
});

describe("nextPage", () => {
  it("returns null on the last page without fetching", async () => {
    const { fetchNext } = source({});
    const page = createPage(response("events", [1], null), "events", fetchNext);
    expect(await page.nextPage()).toBeNull();
    expect(fetchNext).not.toHaveBeenCalled();
  });

  it("carries the original request options forward and layers overrides on top", async () => {
    const original: RequestOptions = { apiKey: "key-a", timeoutMs: 1_000 };
    const { fetchNext, calls } = source({
      c1: response("events", [2], "c2"),
      c2: response("events", [3], null),
    });
    const page = createPage(
      response("events", [1], "c1"),
      "events",
      fetchNext,
      original,
    );

    const second = await page.nextPage();
    const third = await second?.nextPage({ apiKey: "key-b" });

    expect(ids(third?.data ?? [])).toEqual([3]);
    expect(calls[0]?.options).toBe(original);
    expect(calls[1]?.options).toEqual({ apiKey: "key-b", timeoutMs: 1_000 });
  });

  it("replaces the customer rather than carrying both when an override names an apiKey", async () => {
    const original: RequestOptions = { creatorId: "usr_1", timeoutMs: 1_000 };
    const { fetchNext, calls } = source({
      c1: response("events", [2], null),
    });
    const page = createPage(
      response("events", [1], "c1"),
      "events",
      fetchNext,
      original,
    );

    const second = await page.nextPage({ apiKey: "key-b" });

    expect(ids(second?.data ?? [])).toEqual([2]);
    expect(calls[0]?.options).toEqual({ apiKey: "key-b", timeoutMs: 1_000 });
    expect(calls[0]?.options).not.toHaveProperty("creatorId");
  });

  it("replaces the customer rather than carrying both when an override names a creatorId", async () => {
    const original: RequestOptions = { apiKey: "key-a", timeoutMs: 1_000 };
    const { fetchNext, calls } = source({
      c1: response("events", [2], null),
    });
    const page = createPage(
      response("events", [1], "c1"),
      "events",
      fetchNext,
      original,
    );

    const second = await page.nextPage({ creatorId: "usr_1" });

    expect(ids(second?.data ?? [])).toEqual([2]);
    expect(calls[0]?.options).toEqual({ creatorId: "usr_1", timeoutMs: 1_000 });
    expect(calls[0]?.options).not.toHaveProperty("apiKey");
  });

  it("leaves an override naming both customers for the resolver to refuse", async () => {
    const { fetchNext, calls } = source({ c1: response("events", [2], null) });
    const page = createPage(
      response("events", [1], "c1"),
      "events",
      fetchNext,
      { creatorId: "usr_1" },
    );

    await page.nextPage({ apiKey: "key-b", creatorId: "usr_2" });

    expect(calls[0]?.options).toMatchObject({
      apiKey: "key-b",
      creatorId: "usr_2",
    });
  });

  it("refuses a customer override set to undefined instead of switching customer", async () => {
    const { fetchNext } = source({ c1: response("events", [2], null) });
    const page = createPage(
      response("events", [1], "c1"),
      "events",
      fetchNext,
      { apiKey: "key-a" },
    );

    await expect(
      // Only a JavaScript caller can get here; the option type forbids it.
      page.nextPage({ apiKey: undefined } as unknown as RequestOptions),
    ).rejects.toThrow(LayloConfigurationError);
  });
});

describe("toArray", () => {
  it("stops reading pages once maxItems is reached", async () => {
    const { fetchNext } = source({
      c1: response("events", [3, 4], "c2"),
      c2: response("events", [5, 6], null),
    });
    const page = createPage(
      response("events", [1, 2], "c1"),
      "events",
      fetchNext,
    );

    expect(ids(await page.toArray({ maxItems: 3 }))).toEqual([1, 2, 3]);
    expect(fetchNext).toHaveBeenCalledTimes(1);
  });

  it.each([0, -1, 1.5, NaN])("rejects maxItems %p", async (maxItems) => {
    const page = createPage(
      response("events", [1], null),
      "events",
      source({}).fetchNext,
    );
    await expect(page.toArray({ maxItems })).rejects.toBeInstanceOf(
      LayloConfigurationError,
    );
  });
});

describe("validateLimit", () => {
  it.each([undefined, 1, 50, 200])("accepts %p", (limit) => {
    expect(() => validateLimit(limit)).not.toThrow();
  });

  it.each([0, 201, 1.5, -5, NaN])("rejects %p before any request", (limit) => {
    expect(() => validateLimit(limit)).toThrow(LayloConfigurationError);
    expect(() => validateLimit(limit)).toThrow(/between 1 and 200/);
  });
});
