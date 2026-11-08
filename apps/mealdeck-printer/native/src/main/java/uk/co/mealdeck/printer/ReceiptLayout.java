package uk.co.mealdeck.printer;

import org.json.JSONArray;
import org.json.JSONObject;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

/** Browser-receipt hierarchy as an immutable, measured display list. Presentation
 * never changes the canonical model, text contract or fingerprint. */
public final class ReceiptLayout {
    public static final int WIDTH = 384;
    public static final int MAX_HEIGHT = 16_000;
    public static final int FINAL_PAPER_TAIL = 180;
    public static final int MARGIN = 12;
    public static final int LOGO_WIDTH = 256;
    public static final int LOGO_HEIGHT = 258;
    private static final int RIGHT = WIDTH - MARGIN;
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern(
        "dd/MM/yyyy, HH:mm:ss", Locale.UK).withZone(ZoneId.of("Europe/London"));

    public enum Kind { TEXT, DASHED_RULE, BOX, VERTICAL_RULE, LOGO, PROMOTION_IMAGE }
    public enum Style {
        BRAND(34, 44, true), ORDER(36, 46, true), BODY(20, 28, false),
        BODY_BOLD(20, 28, true), HEADER_DETAIL(18, 25, false),
        HEADER_DETAIL_BOLD(18, 25, true), SMALL(17, 24, false),
        SMALL_BOLD(17, 24, true), TOTAL(26, 35, true),
        PROMOTION(18, 25, true), FOOTER(16, 23, false), FOOTER_BOLD(16, 23, true);
        public final int textSize;
        public final int minimumLineHeight;
        public final boolean bold;
        Style(int textSize, int minimumLineHeight, boolean bold) {
            this.textSize = textSize;
            this.minimumLineHeight = minimumLineHeight;
            this.bold = bold;
        }
    }
    @FunctionalInterface
    public interface TextMeasurer {
        float width(String text, Style style);
        default int lineHeight(Style style) { return style.minimumLineHeight; }
    }
    public static final class Element {
        public final Kind kind;
        public final String role;
        public final String text;
        public final Style style;
        public final int x, y, width, height;
        private Element(Kind kind, String role, String text, Style style,
                        int x, int y, int width, int height) {
            this.kind = kind;
            this.role = role;
            this.text = text;
            this.style = style;
            this.x = x;
            this.y = y;
            this.width = width;
            this.height = height;
        }
        public int bottom() { return y + height; }
    }
    public final List<Element> elements;
    public final int width = WIDTH;
    public final int contentHeight;
    public final int totalHeight;
    public final int lineCount;
    public final ReceiptPromotion.Slot promotion;
    private ReceiptLayout(Builder builder) {
        elements = Collections.unmodifiableList(new ArrayList<>(builder.elements));
        contentHeight = builder.y;
        totalHeight = contentHeight + FINAL_PAPER_TAIL;
        lineCount = builder.lineCount;
        promotion = builder.promotion;
    }
    public static ReceiptLayout build(ReceiptModel model, TextMeasurer measurer) {
        return build(model, measurer, null);
    }
    public static ReceiptLayout build(ReceiptModel model, TextMeasurer measurer, String customerPhone) {
        if (model == null || measurer == null) throw unavailable();
        return new Builder(measurer).build(model.toJson(), customerPhone);
    }

    private static final class Builder {
        private final TextMeasurer measurer;
        private final List<Element> elements = new ArrayList<>();
        private int y;
        private int lineCount;
        private ReceiptPromotion.Slot promotion;
        Builder(TextMeasurer measurer) { this.measurer = measurer; }

        ReceiptLayout build(JSONObject receipt, String customerPhone) {
            promotion = ReceiptPromotion.forOrder(nullable(receipt, "orderNumber"), receipt.optString("orderId"));
            gap(8);
            block(Kind.LOGO, "logo", (WIDTH - LOGO_WIDTH) / 2, LOGO_WIDTH, LOGO_HEIGHT);
            gap(8);
            center("brand", "MEALDECK", Style.BRAND);
            center("location", receipt.optString("locationName"), Style.HEADER_DETAIL);
            String order = nullable(receipt, "orderNumber");
            if (order != null) {
                gap(8);
                center("order", "ORDER " + order, Style.ORDER);
            }
            gap(6);
            center("collection.label", "delivery".equals(receipt.optString("fulfilment")) ? "DELIVERY CODE" : "COLLECTION CODE", Style.HEADER_DETAIL_BOLD);
            center("collection", receipt.optString("displayCode"), Style.ORDER);
            gap(6);
            String paid = "cash".equals(receipt.optString("paymentMethod")) ? "CASH PAID" : "PAID";
            center("fulfilment", ("delivery".equals(receipt.optString("fulfilment")) ? "OWN DRIVER DELIVERY" : "curbside".equals(receipt.optString("fulfilment")) ? "KERBSIDE" : "COLLECTION")
                + " · " + paid, Style.BODY_BOLD);
            if (receipt.optInt("copyNumber") > 1) {
                gap(8);
                box("copy", "COPY " + receipt.optInt("copyNumber") + " — " + receipt.optString("reprintReason"));
            }
            gap(10);
            center("customer", receipt.optString("customerName"), Style.BODY_BOLD);
            if (customerPhone != null) center("customer.phone", customerPhone, Style.BODY_BOLD);
            center("paid-at", DATE.format(Instant.parse(receipt.optString("paidAt"))), Style.HEADER_DETAIL);
            JSONObject car = receipt.optJSONObject("car");
            if (car != null) {
                gap(4);
                center("car", car.optString("colour") + " " + car.optString("make")
                    + " · Reg ends " + car.optString("registrationLast4"), Style.HEADER_DETAIL_BOLD);
            }
            gap(10);
            rule("header.rule");
            gap(12);
            JSONObject packing = receipt.optJSONObject("packingPlan");
            JSONArray bags = packing.optJSONArray("bags");
            String cutlery = receipt.optBoolean("cutleryRequested") ? "INCLUDE CUTLERY" : "NO CUTLERY REQUESTED";
            if (packing.optBoolean("separateBags")) cutlery += " · " + bags.length() + " numbered bags";
            paragraph("cutlery", cutlery, Style.BODY_BOLD, MARGIN, RIGHT, false);
            gap(14);
            JSONArray items = receipt.optJSONArray("items");
            for (int n = 0; n < items.length(); n++) {
                JSONObject parent = items.optJSONObject(n);
                if (nullable(parent, "parentLineId") != null) continue;
                item(parent, bags);
                for (int c = 0; c < items.length(); c++) {
                    JSONObject child = items.optJSONObject(c);
                    if (parent.optString("lineId").equals(nullable(child, "parentLineId"))) item(child, bags);
                }
            }
            String notes = nullable(receipt, "orderNotes");
            if (notes != null && !notes.isEmpty()) {
                rule("order-note.top");
                gap(8);
                paragraph("order-note", "Order note: " + notes, Style.BODY_BOLD, MARGIN, RIGHT, false);
                gap(8);
                rule("order-note.bottom");
                gap(10);
            }
            rule("totals.rule");
            gap(12);
            pair("subtotal", "Subtotal", money(receipt.optLong("subtotalPence")), Style.BODY, MARGIN);
            if (receipt.optLong("discountPence") > 0) {
                gap(4);
                pair("discount", "Opening offer", "−" + money(receipt.optLong("discountPence")), Style.BODY, MARGIN);
            }
            gap(4);
            pair("paid", paid, money(receipt.optLong("totalPence")), Style.TOTAL, MARGIN);
            // A tight seven-pixel separation precedes the original promotion.
            // The QR's own quiet zone is separate and remains untouched.
            gap(2);
            rule("promotion.rule");
            gap(4);
            center("promotion.heading", promotion.heading, Style.PROMOTION);
            if (!promotion.subtitle.isEmpty()) center("promotion.subtitle", promotion.subtitle, Style.SMALL);
            block(Kind.PROMOTION_IMAGE, "promotion.image", (WIDTH - promotion.width) / 2,
                promotion.width, promotion.height);
            if (!promotion.displayUrl.isEmpty()) center("promotion.url", promotion.displayUrl, Style.FOOTER);
            gap(8);
            rule("footer.rule");
            gap(10);
            center("footer.trading", "MealDeck is a trading name of 313 Brands Ltd.", Style.FOOTER);
            center("footer.technology", "mealdeck.co.uk · Powered by Dishbee", Style.FOOTER);
            gap(8);
            center("footer.slogan", "ONE ORDER. EVERY CRAVING.", Style.FOOTER_BOLD);
            return new ReceiptLayout(this);
        }

        private void item(JSONObject item, JSONArray bags) {
            String id = item.optString("lineId");
            String role = "item." + id;
            boolean child = nullable(item, "parentLineId") != null;
            int left = child ? MARGIN + 28 : MARGIN;
            int top = y;
            pair(role + ".name", item.optInt("quantity") + "× " + item.optString("name"),
                money(item.optLong("linePence")), Style.BODY_BOLD, left);
            paragraph(role + ".unit", item.optString("brandName")
                + (child ? " · extra with item above" : "") + " · " + money(item.optLong("unitPence")) + " each",
                Style.SMALL, left, RIGHT, false);
            gap(4);
            List<String> allocations = new ArrayList<>();
            for (int b = 0; b < bags.length(); b++) {
                JSONObject bag = bags.optJSONObject(b);
                JSONArray contents = bag.optJSONArray("allocations");
                for (int a = 0; a < contents.length(); a++) {
                    JSONObject allocation = contents.optJSONObject(a);
                    if (id.equals(allocation.optString("lineId"))) {
                        String name = nullable(bag, "name");
                        allocations.add((name == null ? "" : name + " · ") + "Bag " + bag.optInt("number")
                            + ": " + allocation.optInt("quantity") + "×");
                    }
                }
            }
            paragraph(role + ".packing", String.join(" · ", allocations), Style.SMALL_BOLD, left, RIGHT, false);
            JSONArray components = item.optJSONArray("mealComponents");
            if (components != null && components.length() > 0) {
                gap(8);
                int componentTop = y;
                paragraph(role + ".components.heading", "Meal includes", Style.SMALL_BOLD, left + 12, RIGHT, false);
                for (int c = 0; c < components.length(); c++) {
                    JSONObject component = components.optJSONObject(c);
                    String replacement = component.optBoolean("replacement") ? " — replaces standard "
                        + ("drink".equals(component.optString("slot")) ? "drink" : "side") : "";
                    paragraph(role + ".component." + c,
                        item.optInt("quantity") * component.optInt("quantityPerParent") + "× "
                            + component.optString("name") + replacement, Style.SMALL, left + 12, RIGHT, false);
                }
                add(Kind.VERTICAL_RULE, role + ".components.rule", null, null, left + 2, componentTop, 2, y - componentTop);
            }
            JSONArray modifiers = item.optJSONArray("modifiers");
            if (modifiers.length() > 0) {
                gap(4);
                paragraph(role + ".choices.heading", "Choices included in item price", Style.SMALL_BOLD, left, RIGHT, false);
                for (int m = 0; m < modifiers.length(); m++) {
                    gap(4);
                    JSONObject modifier = modifiers.optJSONObject(m);
                    paragraph(role + ".choice." + m, modifier.optString("groupName") + ": "
                        + modifier.optInt("quantityPerParent") + "× " + modifier.optString("name") + " per item",
                        Style.SMALL, left, RIGHT, false);
                }
            }
            String note = nullable(item, "notes");
            if (note != null && !note.isEmpty()) {
                gap(4);
                paragraph(role + ".note", "Note: " + note, Style.BODY_BOLD, left, RIGHT, false);
            }
            if (child) add(Kind.VERTICAL_RULE, role + ".extra.rule", null, null, left - 12, top, 1, y - top);
            gap(12);
        }
        private void center(String role, String value, Style style) { paragraph(role, value, style, MARGIN, RIGHT, true); }
        private void paragraph(String role, String value, Style style, int left, int right, boolean centered) {
            List<String> lines = wrap(value, style, right - left);
            int lineHeight = lineHeight(style);
            for (String line : lines) {
                int width = measuredWidth(line, style);
                add(Kind.TEXT, role, line, style, centered ? left + (right - left - width) / 2 : left, y, width, lineHeight);
                gap(lineHeight);
                lineCount++;
            }
        }
        private void pair(String role, String label, String value, Style style, int left) {
            int valueWidth = measuredWidth(value, style);
            int labelWidth = RIGHT - left - valueWidth - 12;
            if (labelWidth <= 0) throw unavailable();
            List<String> lines = wrap(label, style, labelWidth);
            int lineHeight = lineHeight(style);
            add(Kind.TEXT, role + ".amount", value, style, RIGHT - valueWidth, y, valueWidth, lineHeight);
            for (String line : lines) {
                add(Kind.TEXT, role, line, style, left, y, measuredWidth(line, style), lineHeight);
                gap(lineHeight);
                lineCount++;
            }
        }
        private void box(String role, String value) {
            Style style = Style.BODY_BOLD;
            List<String> lines = wrap(value, style, WIDTH - MARGIN * 2 - 20);
            int height = Math.addExact(Math.multiplyExact(lines.size(), lineHeight(style)), 16);
            add(Kind.BOX, role + ".box", null, null, MARGIN, y, WIDTH - MARGIN * 2, height);
            gap(8);
            for (String line : lines) {
                int width = measuredWidth(line, style);
                add(Kind.TEXT, role, line, style, (WIDTH - width) / 2, y, width, lineHeight(style));
                gap(lineHeight(style));
                lineCount++;
            }
            gap(8);
        }
        private void rule(String role) { block(Kind.DASHED_RULE, role, MARGIN, WIDTH - MARGIN * 2, 1); }
        private void block(Kind kind, String role, int x, int width, int height) {
            add(kind, role, null, null, x, y, width, height);
            gap(height);
        }
        private void add(Kind kind, String role, String text, Style style, int x, int top, int width, int height) {
            if (x < 0 || top < 0 || width < 0 || height <= 0 || x + width > WIDTH) throw unavailable();
            if ((long) top + height + FINAL_PAPER_TAIL > MAX_HEIGHT) throw tooLong();
            elements.add(new Element(kind, role, text, style, x, top, width, height));
        }
        private void gap(int height) {
            if (height < 0 || (long) y + height + FINAL_PAPER_TAIL > MAX_HEIGHT) throw tooLong();
            y += height;
        }
        private int lineHeight(Style style) {
            int height = measurer.lineHeight(style);
            if (height < style.minimumLineHeight || height > 128) throw unavailable();
            return height;
        }
        private int measuredWidth(String value, Style style) {
            float width = measurer.width(value, style);
            if (!Float.isFinite(width) || width < 0 || width > Integer.MAX_VALUE) throw unavailable();
            return (int) Math.ceil(width);
        }
        /** Wrap by measured pixels and code-point boundaries, without ellipsis. */
        private List<String> wrap(String value, Style style, int width) {
            if (width <= 0) throw unavailable();
            List<String> lines = new ArrayList<>();
            int start = 0;
            while (start < value.length()) {
                int low = 1, high = value.codePointCount(start, value.length()), fits = 0;
                while (low <= high) {
                    int count = low + (high - low) / 2;
                    int end = value.offsetByCodePoints(start, count);
                    if (measuredWidth(value.substring(start, end), style) <= width) { fits = count; low = count + 1; }
                    else high = count - 1;
                }
                if (fits == 0) throw unavailable();
                int end = value.offsetByCodePoints(start, fits), next = end;
                if (end < value.length()) {
                    int boundary = end;
                    while (boundary > start) {
                        int cp = value.codePointBefore(boundary);
                        if (Character.isWhitespace(cp) || Character.isSpaceChar(cp)) {
                            int before = boundary - Character.charCount(cp);
                            if (before > start) { end = before; next = boundary; }
                            break;
                        }
                        boundary -= Character.charCount(cp);
                    }
                }
                lines.add(value.substring(start, end));
                if ((long) lines.size() * lineHeight(style) + y + FINAL_PAPER_TAIL > MAX_HEIGHT) throw tooLong();
                start = next;
                while (start < value.length()) {
                    int cp = value.codePointAt(start);
                    if (!Character.isWhitespace(cp) && !Character.isSpaceChar(cp)) break;
                    start += Character.charCount(cp);
                }
            }
            if (lines.isEmpty()) lines.add("");
            return lines;
        }
    }
    private static String nullable(JSONObject object, String key) {
        return !object.has(key) || object.isNull(key) ? null : object.optString(key);
    }
    private static String money(long pence) { return String.format(Locale.ROOT, "£%d.%02d", pence / 100, pence % 100); }
    private static IllegalArgumentException unavailable() { return new IllegalArgumentException("receipt_layout_unavailable"); }
    private static IllegalArgumentException tooLong() { return new IllegalArgumentException("receipt_too_long"); }
}
