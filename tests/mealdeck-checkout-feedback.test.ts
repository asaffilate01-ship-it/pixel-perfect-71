import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { CheckoutActionFeedback } from "../src/components/launch-checkout";

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
