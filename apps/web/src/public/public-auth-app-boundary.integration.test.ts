import { describe, expect, it, vi } from "vitest";
import React, { type ReactElement } from "react";

const redirect = vi.hoisted(() =>
  vi.fn((destination: string): never => {
    throw new Error(`NEXT_REDIRECT:${destination}`);
  }),
);
const requireActor = vi.hoisted(() => vi.fn());
const cookies = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/headers", () => ({
  cookies,
  headers: vi.fn().mockResolvedValue(new Headers()),
}));
vi.mock("@/identity/http", () => ({ requireActor }));

import { GET as GET_PROJECTS } from "../../app/api/v1/projects/route";
import ConsoleLayout from "../../app/app/layout";
import PublicHomePage from "../../app/(public)/page";
import PublicLayout from "../../app/(public)/layout";
import { ApplicationError } from "@scouthub/application";
import { BottomNav, Sidebar } from "@scouthub/ui";

describe("public, auth and app route boundary", () => {
  it("serves the real public page anonymously without an auth redirect", async () => {
    setProductionEnvironment();
    cookies.mockResolvedValue({ get: vi.fn().mockReturnValue(undefined) });

    const page = asElement(PublicHomePage());
    const layout = asElement(await PublicLayout({ children: page }));
    const layoutProps = elementProps(layout);

    expect(page.type).toBe("main");
    expect(layout.type).toBe("div");
    expect(layoutProps.className).toBe("public-shell");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects an anonymous production request from the real app layout", async () => {
    setProductionEnvironment();
    requireActor.mockRejectedValueOnce(
      new ApplicationError(
        "Authentication required.",
        "AUTHENTICATION_REQUIRED",
        401,
      ),
    );

    await expect(ConsoleLayout({ children: "private" })).rejects.toThrow(
      "NEXT_REDIRECT:/sign-in/",
    );
    expect(redirect).toHaveBeenCalledWith("/sign-in/");
  });

  it("keeps the real internal API handler anonymous response data-free", async () => {
    requireActor.mockRejectedValueOnce(
      new ApplicationError(
        "Authentication required.",
        "AUTHENTICATION_REQUIRED",
        401,
      ),
    );

    const response = await GET_PROJECTS(
      new Request(
        "http://localhost:3000/api/v1/projects?tenantId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      ),
    );
    const body: unknown = (await response.json()) as unknown;

    expect(response.status).toBe(401);
    expect(body).not.toHaveProperty("data");
    expect(body).not.toHaveProperty("projects");
  });

  it("keeps private navigation out of the public layout", async () => {
    setProductionEnvironment();
    cookies.mockResolvedValue({ get: vi.fn().mockReturnValue(undefined) });
    const layout = asElement(
      await PublicLayout({ children: asElement(PublicHomePage()) }),
    );
    const topLevelChildren = elementChildren(layout);
    const publicHeader = asElement(topLevelChildren[0]);
    const publicNavigation = asElement(elementChildren(publicHeader)[1]);
    const topLevelTypes = topLevelChildren.map(
      (child) => asElement(child).type,
    );

    expect(publicHeader.type).toBe("header");
    expect(publicNavigation.type).toBe("nav");
    expect(elementProps(publicNavigation)["aria-label"]).toBe(
      "Navigation publique",
    );
    expect(topLevelTypes).not.toContain(Sidebar);
    expect(topLevelTypes).not.toContain(BottomNav);
  });

  it("keeps the private navigation in the authenticated app layout", async () => {
    requireActor.mockResolvedValueOnce({
      account: { primaryEmail: "local@example.test" },
      assignments: [],
      person: null,
    });

    const layout = asElement(await ConsoleLayout({ children: "private" }));
    const layoutChildren = elementChildren(layout);
    const privateNavigation = asElement(layoutChildren[0]);

    expect(elementProps(layout).className).toBe("console-shell");
    expect(privateNavigation.type).toBe(Sidebar);
    expect(asElement(layoutChildren[3]).type).toBe(BottomNav);
  });
});

function setProductionEnvironment(): void {
  process.env.APP_ENV = "test";
  process.env.APP_ORIGIN = "https://scouthub.example.test";
  process.env.DATABASE_URL =
    "postgres://scouthub:scouthub@db.example.test/scouthub";
}

function asElement(value: unknown): ReactElement {
  if (!React.isValidElement(value)) {
    throw new Error("Expected a React element.");
  }
  return value;
}

function elementProps(value: unknown): Record<string, unknown> {
  return asElement(value).props as Record<string, unknown>;
}

function elementChildren(value: unknown): unknown[] {
  const children = elementProps(value).children;
  if (!Array.isArray(children)) {
    throw new Error("Expected an element with array children.");
  }
  return children;
}
