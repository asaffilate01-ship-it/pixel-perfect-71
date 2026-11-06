import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import {
  CheckoutActionFeedback,
  CheckoutSpecialRequests,
  CheckoutSpecialRequestsReview,
} from "../src/components/launch-checkout";

describe("checkout action feedback", () => {
  test("a rejected payment has one focusable alert with the actual escaped error", () => {
    const html = renderToStaticMarkup(
      createElement(CheckoutActionFeedback, {
        issue: "Please refresh your total. <Try again>",
        paymentPending: false,
      }),
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain("Please refresh your total. &lt;Try again&gt;");
    expect(html).not.toContain('role="status"');
  });

  test("pending payment is announced without implying payment success", () => {
    const html = renderToStaticMarkup(
      createElement(CheckoutActionFeedback, { issue: null, paymentPending: true }),
    );
    expect(html).toContain('role="status"');
    expect(html).toContain("Keep this page open while we connect to secure checkout.");
    expect(html).not.toContain('role="alert"');
    expect(
      renderToStaticMarkup(
        createElement(CheckoutActionFeedback, { issue: null, paymentPending: false }),
      ),
    ).toBe("");
  });

  test("feedback belongs to the basket summary beside the payment controls", () => {
    const source = ts.createSourceFile(
      "launch-checkout.tsx",
      readFileSync(new URL("../src/components/launch-checkout.tsx", import.meta.url), "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const feedback: ts.JsxSelfClosingElement[] = [];
    const visit = (node: ts.Node) => {
      if (
        ts.isJsxSelfClosingElement(node) &&
        node.tagName.getText(source) === "CheckoutActionFeedback"
      )
        feedback.push(node);
      ts.forEachChild(node, visit);
    };
    visit(source);
    expect(feedback).toHaveLength(1);
    let ancestor: ts.Node | undefined = feedback[0]!.parent;
    while (
      ancestor &&
      !(ts.isJsxElement(ancestor) && ancestor.openingElement.tagName.getText(source) === "aside")
    )
      ancestor = ancestor.parent;
    expect(ancestor).toBeDefined();
    const summary = ancestor!.getText(source);
    expect(summary).toContain("md-checkout-summary");
    expect(summary).toContain("Confirm & pay ");
    expect(summary.indexOf("<CheckoutActionFeedback")).toBeLessThan(
      summary.indexOf("{canCheckout &&"),
    );
  });
});

describe("customer special requests", () => {
  const field = (value: string, disabled = false) =>
    renderToStaticMarkup(
      createElement(CheckoutSpecialRequests, { value, disabled, onChange: () => {} }),
    );

  test("is optional, labelled and explains that paid extras belong in menu selections", () => {
    const html = field("");
    expect(html).toContain("Special requests <span>(optional)</span>");
    expect(html).toContain('placeholder="No onions; sauce separately"');
    expect(html).toContain("Choose extra items and paid add-ons from the menu.");
    expect(html).toContain("0 / 1000");
    expect(html).toContain('aria-invalid="false"');
    expect(html).toContain("aria-describedby=");
    expect(html).not.toMatch(/<textarea[^>]*required/);
    expect(html).not.toContain('role="alert"');
    const id = html.match(/<textarea[^>]*\sid="([^"]+)"/)?.[1];
    expect(id).toBeDefined();
    expect(html).toContain(`for="${id}"`);
  });

  test("uses the Unicode limit and exposes invalid text instead of silently deleting instructions", () => {
    const valid = field("😀".repeat(1000));
    expect(valid).toContain("1000 / 1000");
    expect(valid).toContain('aria-invalid="false"');
    for (const value of ["a".repeat(1001), "No onions\u200b"]) {
      const html = field(value);
      expect(html).toContain('aria-invalid="true"');
      expect(html).toContain('role="alert"');
      expect(html).toContain("Use up to 1,000 characters of plain text for special requests.");
      expect(html).toContain(value);
    }
  });

  test("editing is disabled during checkout work and text stays escaped", () => {
    const html = field("No <script>alert(1)</script> & sauce separately", true);
    expect(html.match(/<textarea[^>]*>/)?.[0]).toContain('disabled=""');
    expect(html).toContain("No &lt;script&gt;alert(1)&lt;/script&gt; &amp; sauce separately");
    expect(html).not.toContain("<script>");
  });

  test("the frozen review keeps multiline text and contains no editing or payment action", () => {
    const html = renderToStaticMarkup(
      createElement(CheckoutSpecialRequestsReview, {
        notes: "No onions\nKeep <sauce> & chips separate",
      }),
    );
    expect(html).toContain('aria-label="Special requests"');
    expect(html).toContain("No onions\nKeep &lt;sauce&gt; &amp; chips separate");
    expect(html).not.toMatch(/<(textarea|button|input|form)\b/);
    for (const notes of [null, ""])
      expect(renderToStaticMarkup(createElement(CheckoutSpecialRequestsReview, { notes }))).toBe(
        "",
      );
  });
});
