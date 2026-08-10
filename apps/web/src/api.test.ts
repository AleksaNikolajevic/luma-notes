import { afterEach, describe, expect, test, vi } from "vitest";
import { api, buildNoteListPath } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("notes API client", () => {
  test("encodes server-side search and cursor pagination", () => {
    expect(
      buildNoteListPath({
        cursor: "next/page",
        search: "  plan & ideje  ",
        limit: 25,
      }),
    ).toBe("/api/notes?cursor=next%2Fpage&search=plan+%26+ideje&limit=25");
  });

  test("sends cookies and the encoded query to the API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ notes: [], nextCursor: null }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await api.notes({ search: "vikend ideje" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/notes?search=vikend+ideje",
      expect.objectContaining({ credentials: "include" }),
    );
  });
});
