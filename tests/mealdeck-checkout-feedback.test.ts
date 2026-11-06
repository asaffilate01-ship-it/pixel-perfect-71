import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import {
  CheckoutActionFeedback,
  CheckoutSpecialRequests,
  CheckoutSpecialRequestsReview,
  DetailedOrderLines,
} from "../src/components/launch-checkout";

describe("canonical checkout item prices", () => {
  test("review and customer receipt show inclusive prices, complete bag quantities and separately priced extras", () => {
    const props: ComponentProps<typeof DetailedOrderLines> = {
      lines: [
        {
          lineId: "wings",
          parentLineId: null,
          name: "Fried Chicken Wings",
          quantity: 3,
          base_unit_pence: 299,
          unit_pence: 350,
          line_pence: 1050,
          attachment: null,
          modifiers: [
            {
              group_name: "Portion & flavour",
              name: "Korean BBQ · 3 pcs",
              price_delta_pence: 51,
              kind: "variant",
              target_brand_name: null,
              target_description: null,
            },
            {
              group_name: "Sauces",
              name: "Selected sauce",
              quantity_per_parent: 2,
              price_delta_pence: 0,
              kind: "source",
              target_brand_name: null,
              target_description: null,
            },
          ],
        },
        {
          lineId: "burger",
          parentLineId: null,
          name: "The Ace",
          quantity: 1,
          base_unit_pence: 399,
          unit_pence: 649,
          line_pence: 649,
          attachment: null,
          modifiers: [
            {
              group_name: "Meal",
              name: "Make it a meal",
              quantity_per_parent: 1,
              price_delta_pence: 250,
              kind: "source",
              target_brand_name: null,
              target_description: null,
            },
          ],
        },
        {
          lineId: "wings-extra-drink",
          parentLineId: "wings",
          name: "Mango Mirage",
          quantity: 3,
          base_unit_pence: 450,
          unit_pence: 450,
          line_pence: 1350,
          attachment: "drink",
          modifiers: [
            {
              group_name: "Selected drink",
              name: "Mango Mirage",
              quantity_per_parent: 1,
              price_delta_pence: 0,
              kind: "source",
              target_brand_name: "Moktl",
              target_description: "Mango <fruit> & lime",
            },
          ],
        },
      ],
      packingPlan: {
        version: 1,
        separateBags: true,
        cutleryRequested: false,
        bags: [
          {
            number: 1,
            name: "Amer",
            allocations: [
              { lineId: "wings", quantity: 2 },
              { lineId: "burger", quantity: 1 },
              { lineId: "wings-extra-drink", quantity: 2 },
            ],
          },
          {
            number: 2,
            name: "Jay",
            allocations: [
              { lineId: "wings", quantity: 1 },
              { lineId: "wings-extra-drink", quantity: 1 },
            ],
          },
        ],
      },
    };
    const before = JSON.stringify(props);
    const html = renderToStaticMarkup(createElement(DetailedOrderLines, props));
    const bags = html.split('class="md-checkout-bag"').slice(1);
    expect(bags).toHaveLength(2);
    const first = bags[0]!;
    const second = bags[1]!;
    expect(first).toContain('aria-label="Amer · Bag 1"');
    expect(second).toContain('aria-label="Jay · Bag 2"');
    expect(html).toContain("Separate numbered bags");
    expect(html).toContain("No cutlery requested");
    expect(html).toContain("Each, including choices");
    expect(first).toContain("2 × Fried Chicken Wings</strong><span>£7.00");
    expect(second).toContain("1 × Fried Chicken Wings</strong><span>£3.50");
    expect(first).toContain("1 × The Ace</strong><span>£6.49");
    expect(first).toContain("2 × Mango Mirage</strong><span>£9.00");
    expect(second).toContain("1 × Mango Mirage</strong><span>£4.50");
    expect(first).toContain("2 × Korean BBQ · 3 pcs");
    expect(second).toContain("1 × Korean BBQ · 3 pcs");
    expect(first).toContain("4 × Selected sauce");
    expect(second).toContain("2 × Selected sauce");
    expect(first).toContain("1 × Make it a meal");
    for (const bag of bags) {
      expect(bag).toContain("Extra with Fried Chicken Wings");
      expect(bag).toContain("£3.50</dd>");
      expect(bag).toContain("£4.50</dd>");
      expect(bag).toContain("Moktl · Mango Mirage");
      expect(bag).toContain("Mango &lt;fruit&gt; &amp; lime");
    }
    for (const internalAmount of ["£0.51", "£1.02", "£2.99", "£5.98", "£2.50", "£3.99"])
      expect(html).not.toContain(internalAmount);
    expect(JSON.stringify(props)).toBe(before);
  });
});

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
