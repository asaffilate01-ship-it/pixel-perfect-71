import {describe,expect,test} from "bun:test";
import {renderToStaticMarkup} from "react-dom/server";
import {readFileSync} from "node:fs";
import {SkipToMainContent} from "../src/components/skip-to-main-content";
const root=readFileSync(new URL("../src/routes/__root.tsx",import.meta.url),"utf8");
const tabs=readFileSync(new URL("../src/components/mobile-tab-bar.tsx",import.meta.url),"utf8");

describe("MealDeck keyboard navigation",()=>{
  test("provides one visible-on-focus link to real page content",()=>{
    const html=renderToStaticMarkup(<SkipToMainContent/>);
    expect(html).toContain('href="#mealdeck-main"');
    expect(html).toContain("Skip to main content");
  });
  test("main target is rendered around all nested site routes",()=>{
    expect(root).toContain('id="mealdeck-main"');
    expect(root).toContain("tabIndex={-1}");
    expect(root).toContain("<Outlet />");
    expect(root).toContain("<SkipToMainContent />");
  });
  test("mobile navigation labels collection ordering and the active page",()=>{
    expect(tabs).toContain("Browse MealDeck menus and order for Luton collection or kerbside");
    expect(tabs).toContain('aria-current={dealActive ? "page" : undefined}');
    expect(tabs).toContain("focus-visible:outline");
  });
});
