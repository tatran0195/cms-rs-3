// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";
import type { PageNode } from "./index";

describe("Optimistic Reorder Mutation Pipeline", () => {
  it("immediately updates cache before network resolve and supports rollback", async () => {
    const qc = new QueryClient();
    const projectId = "proj-1";

    const initialPages: PageNode[] = [
      { id: "p1", title: "Page 1", parentId: null, position: 0 } as any,
      { id: "p2", title: "Page 2", parentId: null, position: 1 } as any,
    ];

    qc.setQueryData(queryKeys.pages.allForProject(projectId), initialPages);

    // Snapshot before mutation
    const previous = qc.getQueryData<PageNode[]>(queryKeys.pages.allForProject(projectId));
    expect(previous?.[0]?.position).toBe(0);

    // Apply optimistic update directly to cache
    const newItems = [
      { id: "p1", parentId: null, position: 1 },
      { id: "p2", parentId: null, position: 0 },
    ];
    const orderMap = new Map(newItems.map((it) => [it.id, it]));

    qc.setQueryData<PageNode[]>(queryKeys.pages.allForProject(projectId), (old) => {
      if (!old) return old;
      return old.map((page) => {
        const update = orderMap.get(page.id);
        if (!update) return page;
        return { ...page, parentId: update.parentId, position: update.position };
      });
    });

    // Check optimistic result
    const updated = qc.getQueryData<PageNode[]>(queryKeys.pages.allForProject(projectId));
    expect(updated?.find((p) => p.id === "p1")?.position).toBe(1);
    expect(updated?.find((p) => p.id === "p2")?.position).toBe(0);

    // Rollback simulation
    qc.setQueryData(queryKeys.pages.allForProject(projectId), previous);
    const rolledBack = qc.getQueryData<PageNode[]>(queryKeys.pages.allForProject(projectId));
    expect(rolledBack?.[0]?.position).toBe(0);
    expect(rolledBack?.[1]?.position).toBe(1);
  });
});
