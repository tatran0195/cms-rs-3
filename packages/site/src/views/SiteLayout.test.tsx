// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SiteShell } from "../types";
import { SiteLayout } from "./SiteLayout";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useRouterState: () => "/sites/proj1",
  Outlet: () => <div data-testid="outlet">Content</div>,
}));

vi.mock("../context/site-analytics-provider", () => ({
  SiteAnalyticsProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useSiteAnalytics: () => ({ track: vi.fn() }),
}));

describe("SiteLayout structure", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    Element.prototype.getAnimations = () => [];
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const mockSite: SiteShell = {
    project: {
      id: "proj1",
      name: "Acme Docs",
      slug: "acme-docs",
      description: "Acme documentation",
      config: {
        navbar: {
          showSearch: true,
          anchors: [{ label: "API Reference", href: "/api", icon: "book" }],
        },
      },
      primaryDomain: null,
    },
    nav: [
      {
        id: "p1",
        title: "Getting Started",
        kind: "PAGE",
        path: "getting-started",
        icon: null,
        tag: null,
        children: [],
      },
    ],
    languages: [
      {
        code: "en",
        label: "English",
        direction: "LTR",
        isDefault: true,
        enabled: true,
      },
      {
        code: "fr",
        label: "Français",
        direction: "LTR",
        isDefault: false,
        enabled: true,
      },
    ],
    versions: [
      { id: "v1", name: "v1.0", slug: "v1.0", isDefault: true },
      { id: "v2", name: "v2.0", slug: "v2.0", isDefault: false },
    ],
    activeLanguage: "en",
    activeVersion: "v1.0",
    languageConfig: null,
    version: 1,
    generatedAt: new Date().toISOString(),
    openapi: null,
  };

  it("renders centered search container and places nav anchors without nested aside", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <SiteLayout site={mockSite} projectId="proj1" />
        </QueryClientProvider>,
      );
    });

    // Check that centered search container exists
    const searchContainer = container.querySelector(".justify-center");
    expect(searchContainer).not.toBeNull();

    // Check that nav anchors render
    expect(container.textContent).toContain("API Reference");

    // Check that no aside is nested inside another aside
    const asides = container.querySelectorAll("aside");
    asides.forEach((aside) => {
      expect(aside.querySelector("aside")).toBeNull();
    });

    // Check that main element with min-w-0 exists
    const main = container.querySelector("main.min-w-0");
    expect(main).not.toBeNull();
  });

  it("renders the selected fumadocs layout according to config.theme.layout.docsLayout", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const layouts = ["docs", "notebook", "glass", "flux", "spacious"] as const;
    for (const layoutId of layouts) {
      const siteWithLayout: SiteShell = {
        ...mockSite,
        project: {
          ...mockSite.project,
          config: {
            theme: {
              layout: {
                docsLayout: layoutId,
              },
            },
          },
        },
      };

      await act(async () => {
        root.render(
          <QueryClientProvider client={queryClient}>
            <SiteLayout site={siteWithLayout} projectId="proj1" />
          </QueryClientProvider>,
        );
      });

      const layoutRoot = container.querySelector(`[data-documentation-layout="fumadocs-${layoutId}"]`);
      expect(layoutRoot).not.toBeNull();
    }
  });
});
