# Inclusive item prices on receipts

Owner request: 6 November 2026. The reported order 0005, collection code 7628, showed a £0.51 portion/flavour adjustment beneath each £3.50 wings line. That value is part of the canonical price calculation: £2.99 base plus £0.51 gives the purchased £3.50 unit price before the opening discount. It is not an additional charge on top of £3.50.

The immutable receipt modifier contract contains a label, group, quantity and price delta, but no source/variant kind. Receipt presentation therefore cannot safely distinguish a portion adjustment from another selected choice by inspecting its name. Customer checkout/confirmation receipts, the printer preview and the supported Node thermal renderer now:

- Show the full canonical item unit/line price.
- Retain every purchased choice, its group and quantity under **Choices included in item price**.
- Omit the internal base-price and modifier-delta breakdown.
- Keep genuine extra child items as separate priced lines, with their parent relationship, quantities and packing allocation.
- Preserve the approved logo, meal-content summary, notes, subtotal, discount and paid total.

For the reported price structure, both wings lines remain £3.50 and the burger meal remains £6.49. The labels for Korean BBQ 3 pcs, Fiery Sweet Chilli 3 pcs, Make it a meal and the selected drink remain visible. The receipt still totals £13.49 before the £4.05 opening discount, with £9.44 paid.

This is a renderer change only. No schema, stored JSON, modifier value, quantity, price, receipt fingerprint, copy number or payment record changes. Existing immutable receipt payloads can use the clearer renderer without being rebuilt. Rendering still does not authorize another copy; claims, one-send delivery, recovery and paper confirmation are unchanged.

Focused regressions cover legacy receipt data with both the 51p variant and 250p meal adjustment, two thermal widths, all choice labels, full inclusive prices, genuine extra line prices, the unchanged canonical fingerprint and the retained logo. Existing arithmetic validation continues to reject altered or incomplete receipt data.

The customer review uses the same canonical full unit price with each bag's allocated line total. Its actual-render regression verifies quantities split 2 + 1 across named bags, modifier quantity multiplication, and separately priced extra drinks without changing the input data. A full page reload loads this rendering update; the staff in-app Refresh action refreshes order data only and does not replace already-loaded JavaScript.
