import { describe, expect, test } from "bun:test";
import { isLaunchMenuRoute, validateLaunchMenuSearch } from "../src/lib/launch-menu-navigation";
import { MEALDECK_MENU_PAGES } from "../src/lib/mealdeck-menu-seo";

describe("launch menu navigation", () => {
  test("uses one basket control on every menu entry path, including trailing slashes", () => {
    for (const path of [
      "/menu",
      "/menus",
      "/order",
      "/Menus/tavo-chicken",
      ...MEALDECK_MENU_PAGES.map((page) => page.path),
    ]) {
      expect(isLaunchMenuRoute(path)).toBe(true);
      expect(isLaunchMenuRoute(path + "/")).toBe(true);
    }
  });

  test("preserves general navigation on unrelated and nested routes", () => {
    for (const path of [
      "/",
      "/franchise",
      "/menu-preview",
      "/menus-other",
      "/menus/not-a-brand",
      "/menus/paratique",
      "/menus/loadd/orders",
      "/order/history",
      "/play",
      "//menus",
    ])
      expect(isLaunchMenuRoute(path)).toBe(false);
  });

  test("preserves exact brand and section choices in canonical links", () => {
    expect(
      validateLaunchMenuSearch({ brand: "tavo-chicken", section: "fried-chicken-wings" }),
    ).toEqual({
      brand: "tavo-chicken",
      section: "fried-chicken-wings",
    });
    expect(validateLaunchMenuSearch({ brand: "moktl" })).toEqual({ brand: "moktl" });
    expect(validateLaunchMenuSearch({})).toEqual({});
    expect(validateLaunchMenuSearch({ brand: "", section: "  " })).toEqual({});
  });

  test("does not forward unrelated query state or malformed menu choices", () => {
    expect(
      validateLaunchMenuSearch({
        brand: ["moktl"],
        section: 123,
        preview: "sample",
        redirect: "https://example.com",
      }),
    ).toEqual({});
    expect(
      validateLaunchMenuSearch({ brand: "loadd", section: null, fulfilment: "pickup" }),
    ).toEqual({ brand: "loadd" });
  });
});
