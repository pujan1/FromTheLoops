// company / topic doc builders + their bulk import. Same fake-client approach
// as reports.test.ts — assert the mapped shape and the import failure handling.

import type { Client } from "typesense";
import type { CompanyIndexInput, TopicIndexInput } from "@fromtheloop/db";
import { describe, expect, it, vi } from "vitest";
import {
  buildCompanyDoc,
  buildTopicDoc,
  importCompanyDocs,
  importTopicDocs,
  type CompanyDoc,
} from "./taxonomy.js";

describe("buildCompanyDoc", () => {
  it("maps reportCount onto report_count and passes aliases through", () => {
    const input: CompanyIndexInput = {
      id: "c-1",
      slug: "acme",
      name: "Acme",
      aliases: ["acme-corp", "acmé"],
      reportCount: 7,
    };
    expect(buildCompanyDoc(input)).toEqual({
      id: "c-1",
      name: "Acme",
      slug: "acme",
      aliases: ["acme-corp", "acmé"],
      report_count: 7,
    });
  });
});

describe("buildTopicDoc", () => {
  it("maps questionCount onto question_count", () => {
    const input: TopicIndexInput = {
      id: "t-1",
      slug: "graphs",
      name: "Graphs",
      aliases: ["graph-theory"],
      questionCount: 42,
    };
    expect(buildTopicDoc(input)).toEqual({
      id: "t-1",
      name: "Graphs",
      slug: "graphs",
      aliases: ["graph-theory"],
      question_count: 42,
    });
  });
});

function makeFakeClient(importFn: ReturnType<typeof vi.fn>): {
  client: Client;
  collections: ReturnType<typeof vi.fn>;
} {
  const documents = vi.fn(() => ({ import: importFn }));
  const collections = vi.fn(() => ({ documents }));
  return { client: { collections } as unknown as Client, collections };
}

const COMPANY_DOC: CompanyDoc = {
  id: "c-1",
  name: "Acme",
  slug: "acme",
  aliases: [],
  report_count: 1,
};

describe("importCompanyDocs", () => {
  it("targets the companies collection and returns the count", async () => {
    const importFn = vi.fn().mockResolvedValue([{ success: true }]);
    const { client, collections } = makeFakeClient(importFn);
    expect(await importCompanyDocs(client, [COMPANY_DOC])).toBe(1);
    expect(collections).toHaveBeenCalledWith("companies");
  });

  it("returns 0 without calling the client on an empty batch", async () => {
    const importFn = vi.fn();
    const { client } = makeFakeClient(importFn);
    expect(await importCompanyDocs(client, [])).toBe(0);
    expect(importFn).not.toHaveBeenCalled();
  });

  it("throws on a partial failure", async () => {
    const importFn = vi
      .fn()
      .mockResolvedValue([{ success: false, error: "boom" }]);
    const { client } = makeFakeClient(importFn);
    await expect(importCompanyDocs(client, [COMPANY_DOC])).rejects.toThrow(
      /companies.*1\/1 doc\(s\) failed.*boom/,
    );
  });
});

describe("importTopicDocs", () => {
  it("targets the topics collection", async () => {
    const importFn = vi.fn().mockResolvedValue([{ success: true }]);
    const { client, collections } = makeFakeClient(importFn);
    await importTopicDocs(client, [
      { id: "t-1", name: "Graphs", slug: "graphs", aliases: [], question_count: 1 },
    ]);
    expect(collections).toHaveBeenCalledWith("topics");
  });
});
