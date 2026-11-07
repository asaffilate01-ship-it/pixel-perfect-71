package uk.co.mealdeck.printer;

import org.json.JSONArray;
import org.json.JSONObject;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

/** Pure-Java content/hierarchy/bounds checks; Android instrumentation checks pixels. */
public final class ReceiptLayoutTest {
    private static final ReceiptLayout.TextMeasurer MONOSPACE =
        (text, style) -> text.codePointCount(0, text.length()) * style.textSize * 0.6f;

    public static void main(String[] args) throws Exception {
        run();
        System.out.println("Native full receipt hierarchy, measured wrapping, QR placement and bounds checks passed.");
    }

    static void run() throws Exception {
        JSONObject golden;
        try (InputStream input = ReceiptLayoutTest.class.getResourceAsStream("/receipt-golden.json")) {
            if (input == null) throw new AssertionError("Missing receipt fixtures");
            golden = new JSONObject(new String(input.readAllBytes(), StandardCharsets.UTF_8));
        }
        JSONArray valid = golden.getJSONArray("valid");
        JSONObject detailed = null;
        for (int n = 0; n < valid.length(); n++) {
            JSONObject example = valid.getJSONObject(n);
            ReceiptModel model = ReceiptModel.parse(example.getJSONObject("input"));
            if (example.has("renderError")) {
                fails(() -> ReceiptLayout.build(model, MONOSPACE), "receipt_too_long");
                continue;
            }
            ReceiptLayout layout = ReceiptLayout.build(model, MONOSPACE);
            checkBounds(layout, MONOSPACE);
            assertPurchasedContent(layout, model.toJson());
            equal(example.getString("normalizedJson"), model.normalizedJson, "canonical JSON unchanged");
            equal(example.getString("fingerprint"), model.fingerprint, "fingerprint unchanged");
            checkPromotionAndTail(layout);
            if (example.getString("name").equals("numbered-cash-meal-named-bags")) detailed = model.toJson();
        }
        require(detailed != null, "Detailed fixture missing");
        checkHierarchyAndLastItem(detailed);
        checkHeightBoundary(detailed);
        ReceiptModel model = ReceiptModel.parse(detailed);
        fails(() -> ReceiptLayout.build(model, (text, style) -> Float.NaN), "receipt_layout_unavailable");
        fails(() -> ReceiptLayout.build(model, (text, style) -> text.isEmpty() ? 0 : 500), "receipt_layout_unavailable");
    }

    private static void checkHierarchyAndLastItem(JSONObject fixture) throws Exception {
        JSONObject raw = new JSONObject(fixture.toString());
        raw.put("copyNumber", 2);
        raw.put("reprintOf", "aaaaaaaa-1111-4111-8111-111111111111");
        raw.put("reprintReason", "Paper jam; keep the complete original order and all purchased choices visible. ".repeat(3));
        JSONArray original = raw.getJSONArray("items");
        for (int n = 0; n < original.length(); n++)
            original.getJSONObject(n).put("notes", "Keep every detail, including café 東京 and item-note sentinel " + n);
        JSONObject last = new JSONObject()
            .put("lineId", "last-food").put("parentLineId", JSONObject.NULL)
            .put("brandName", "Moktl").put("name", "LAST FOOD SENTINEL")
            .put("quantity", 1).put("baseUnitPence", 123).put("unitPence", 123).put("linePence", 123)
            .put("notes", "LAST ITEM NOTE SENTINEL").put("modifiers", new JSONArray());
        // Input order deliberately separates a child from its parent. Visual order
        // must group all extras with that parent, while preserving every item once.
        raw.put("items", new JSONArray().put(original.getJSONObject(1)).put(original.getJSONObject(0))
            .put(original.getJSONObject(2)).put(last));
        raw.getJSONObject("packingPlan").getJSONArray("bags").getJSONObject(0)
            .getJSONArray("allocations").put(new JSONObject().put("lineId", "last-food").put("quantity", 1));
        raw.put("subtotalPence", raw.getLong("subtotalPence") + 123);
        raw.put("totalPence", raw.getLong("totalPence") + 123);
        raw.put("orderNotes", "Keep the named bags separate. " + "Every note remains visible. ".repeat(30) + "LAST ORDER NOTE SENTINEL");
        ReceiptModel model = ReceiptModel.parse(raw);
        ReceiptLayout layout = ReceiptLayout.build(model, MONOSPACE);
        assertPurchasedContent(layout, model.toJson());
        checkBounds(layout, MONOSPACE);
        checkPromotionAndTail(layout);
        ReceiptLayout.Element brand = first(layout, "brand"), order = first(layout, "order");
        require(brand.style.textSize > ReceiptLayout.Style.BODY.textSize, "Prominent MEALDECK heading");
        require(order.style.textSize > brand.style.textSize, "Prominent order number");
        require(first(layout, "logo").width == 256 && first(layout, "logo").height == 258, "Full approved logo");
        preserved("ORDER " + raw.getString("orderNumber"), text(layout, "order"), "Long order number");
        equal("Collection code 0427", text(layout, "collection"), "Collection code is separate");
        equal("KERBSIDE · CASH PAID", text(layout, "fulfilment"), "Fulfilment/payment label");
        equal("CASH PAID", text(layout, "paid"), "Cash total label");
        equal("Opening offer", text(layout, "discount"), "Discount label");
        ReceiptLayout.Element box = first(layout, "copy.box");
        for (ReceiptLayout.Element element : role(layout, "copy"))
            require(element.x >= box.x + 8 && element.x + element.width <= box.x + box.width - 8
                && element.y >= box.y + 8 && element.bottom() <= box.bottom() - 8, "Whole copy reason enclosed");
        preserved("COPY 2 — " + raw.getString("reprintReason"), text(layout, "copy"), "Full copy reason");
        require(first(layout, "customer").y > box.bottom(), "Customer/date after copy box");
        require(first(layout, "car").y > first(layout, "customer").y, "Car follows customer");
        require(first(layout, "cutlery").y < first(layout, "item.burger.name").y, "Cutlery before items");
        require(first(layout, "item.burger.name").y < first(layout, "item.fries.name").y
            && first(layout, "item.fries.name").y < first(layout, "item.mocktail.name").y
            && first(layout, "item.mocktail.name").y < first(layout, "item.last-food.name").y, "Parents and all extras grouped");
        require(first(layout, "item.fries.name").x > first(layout, "item.burger.name").x, "Extras visually nested");
        require(first(layout, "item.last-food.note").y < first(layout, "order-note").y, "Last item retained before order note");
        require(last(layout, "order-note").bottom() < first(layout, "subtotal").y, "Complete order note before totals");
        require(!allText(layout).contains("£2.50") && !allText(layout).contains("£1.50"), "Internal modifier adjustments omitted");
        require(!allText(layout).contains("END OF RECEIPT"), "Original browser footer preserved");
        try { layout.elements.clear(); throw new AssertionError("Mutable display list"); }
        catch (UnsupportedOperationException expected) { /* immutable */ }

        // Nonuniform widths prove that wrapping uses measured pixels, not a fixed
        // character limit. The long tokens must survive without split surrogates.
        JSONObject wide = new JSONObject(fixture.toString());
        wide.put("customerName", "WWWWWWWWWWWWWWWWWWWWWWWWiiiiiiiiiiiiiiiiiiiiiiii🙂🙂🙂END");
        ReceiptLayout.TextMeasurer variable = (value, style) -> {
            float width = 0;
            for (int offset = 0; offset < value.length();) {
                int cp = value.codePointAt(offset);
                width += cp == 'W' ? style.textSize : cp == 'i' ? style.textSize * 0.2f : style.textSize * 0.6f;
                offset += Character.charCount(cp);
            }
            return width;
        };
        ReceiptLayout wrapped = ReceiptLayout.build(ReceiptModel.parse(wide), variable);
        checkBounds(wrapped, variable);
        require(role(wrapped, "customer").size() > 1, "Measured long header wraps");
        preserved(wide.getString("customerName") + " · 05/11/2026, 16:05:00", text(wrapped, "customer"), "Wide Unicode header preserved");
        for (ReceiptLayout.Element element : role(wrapped, "customer")) {
            require(element.text.isEmpty() || !Character.isLowSurrogate(element.text.charAt(0)), "No split leading surrogate");
            require(element.text.isEmpty() || !Character.isHighSurrogate(element.text.charAt(element.text.length() - 1)), "No split trailing surrogate");
        }
    }

    private static void checkHeightBoundary(JSONObject fixture) throws Exception {
        int fits = 0, fails = 19_000;
        while (fits + 1 < fails) {
            int count = fits + (fails - fits) / 2;
            try { noteLayout(fixture, count); fits = count; }
            catch (IllegalArgumentException expected) {
                equal("receipt_too_long", expected.getMessage(), "Bounded full-layout rejection");
                fails = count;
            }
        }
        ReceiptLayout longest = noteLayout(fixture, fits);
        require(longest.totalHeight > ReceiptLayout.MAX_HEIGHT - 60, "Exercises near-limit complete receipt");
        checkPromotionAndTail(longest);
        preserved("Order note: " + "W".repeat(fits) + " FINAL NOTE SENTINEL", text(longest, "order-note"), "Last note survives at height boundary");
        int firstTooLong = fails;
        fails(() -> noteLayout(fixture, firstTooLong), "receipt_too_long");
    }

    private static ReceiptLayout noteLayout(JSONObject fixture, int count) {
        try {
            JSONObject raw = new JSONObject(fixture.toString());
            raw.put("orderNotes", "W".repeat(count) + " FINAL NOTE SENTINEL");
            return ReceiptLayout.build(ReceiptModel.parse(raw), MONOSPACE);
        } catch (org.json.JSONException invalidFixture) {
            // Android's JSON signature declares this checked exception, while
            // the JVM test dependency uses the same exception as unchecked.
            throw new AssertionError("Invalid layout boundary fixture", invalidFixture);
        }
    }

    private static void assertPurchasedContent(ReceiptLayout layout, JSONObject receipt) throws Exception {
        JSONArray items = receipt.getJSONArray("items");
        for (int n = 0; n < items.length(); n++) {
            JSONObject item = items.getJSONObject(n);
            String role = "item." + item.getString("lineId");
            preserved(item.getInt("quantity") + "× " + item.getString("name"), text(layout, role + ".name"), "Every full item title");
            equal(money(item.getLong("linePence")), text(layout, role + ".name.amount"), "Canonical line amount");
            require(compact(text(layout, role + ".unit")).contains(compact(money(item.getLong("unitPence")) + " each")), "Canonical each price");
            require(compact(text(layout, role + ".unit")).contains(compact(item.getString("brandName"))), "Item brand");
            if (!item.isNull("notes") && !item.getString("notes").isEmpty())
                preserved("Note: " + item.getString("notes"), text(layout, role + ".note"), "Complete item note");
            JSONArray bags = receipt.getJSONObject("packingPlan").getJSONArray("bags");
            for (int b = 0; b < bags.length(); b++) {
                JSONObject bag = bags.getJSONObject(b);
                JSONArray allocations = bag.getJSONArray("allocations");
                for (int a = 0; a < allocations.length(); a++) {
                    JSONObject allocation = allocations.getJSONObject(a);
                    if (allocation.getString("lineId").equals(item.getString("lineId"))) {
                        String label = (bag.has("name") ? bag.getString("name") + " · " : "")
                            + "Bag " + bag.getInt("number") + ": " + allocation.getInt("quantity") + "×";
                        require(compact(text(layout, role + ".packing")).contains(compact(label)), "Every named bag allocation");
                    }
                }
            }
            JSONArray modifiers = item.getJSONArray("modifiers");
            for (int m = 0; m < modifiers.length(); m++) {
                JSONObject modifier = modifiers.getJSONObject(m);
                preserved(modifier.getString("groupName") + ": " + modifier.getInt("quantityPerParent") + "× "
                    + modifier.getString("name") + " per item", text(layout, role + ".choice." + m), "Every purchased choice");
            }
            JSONArray components = item.optJSONArray("mealComponents");
            if (components != null) for (int c = 0; c < components.length(); c++) {
                JSONObject component = components.getJSONObject(c);
                String expected = item.getInt("quantity") * component.getInt("quantityPerParent") + "× " + component.getString("name");
                if (component.getBoolean("replacement")) expected += " — replaces standard "
                    + (component.getString("slot").equals("drink") ? "drink" : "side");
                preserved(expected, text(layout, role + ".component." + c), "Complete meal component");
            }
        }
        if (!receipt.isNull("orderNotes") && !receipt.getString("orderNotes").isEmpty())
            preserved("Order note: " + receipt.getString("orderNotes"), text(layout, "order-note"), "Complete order note");
        equal(money(receipt.getLong("subtotalPence")), text(layout, "subtotal.amount"), "Subtotal");
        equal(money(receipt.getLong("totalPence")), text(layout, "paid.amount"), "Paid amount");
        if (receipt.getLong("discountPence") > 0)
            equal("−" + money(receipt.getLong("discountPence")), text(layout, "discount.amount"), "Discount amount");
    }

    private static void checkBounds(ReceiptLayout layout, ReceiptLayout.TextMeasurer measurer) {
        require(layout.width == 384 && layout.totalHeight <= 16_000, "Bitmap dimensions bounded");
        for (ReceiptLayout.Element element : layout.elements) {
            require(element.x >= 0 && element.x + element.width <= layout.width
                && element.y >= 0 && element.bottom() <= layout.contentHeight, "Display element inside content");
            if (element.kind == ReceiptLayout.Kind.TEXT)
                require(measurer.width(element.text, element.style) <= element.width, "Measured text fits its reserved width");
        }
        require(layout.lineCount > 0, "Sensible text-line count");
    }
    private static void checkPromotionAndTail(ReceiptLayout layout) {
        int paidBottom = Math.max(last(layout, "paid").bottom(), last(layout, "paid.amount").bottom());
        ReceiptLayout.Element heading = first(layout, "games.heading"), qr = first(layout, "games.qr");
        require(heading.y - paidBottom == 7, "Paid-to-promotion gap remains tight");
        equal(ReceiptGamesQr.HEADING, text(layout, "games.heading"), "Original games heading");
        equal(ReceiptGamesQr.SUBTITLE, text(layout, "games.subtitle"), "Original games subtitle");
        require(qr.y == last(layout, "games.subtitle").bottom(), "QR immediately follows promotion text");
        require(qr.width == 246 && qr.height == 246 && qr.x == 69, "Centered whole QR including quiet border");
        require(first(layout, "games.url").y == qr.bottom(), "Public URL directly below QR");
        require(first(layout, "footer.trading").y > qr.bottom(), "Full footer follows QR");
        equal("ONE ORDER. EVERY CRAVING.", text(layout, "footer.slogan"), "Original final footer");
        require(layout.contentHeight == last(layout, "footer.slogan").bottom(), "No content after final footer");
        require(layout.totalHeight - layout.contentHeight == 180, "Final blank paper tail exactly 180 pixels");
        require(role(layout, "games.qr").size() == 1, "One games QR per receipt");
    }
    private static List<ReceiptLayout.Element> role(ReceiptLayout layout, String name) {
        return layout.elements.stream().filter(element -> element.role.equals(name)).toList();
    }
    private static ReceiptLayout.Element first(ReceiptLayout layout, String name) {
        List<ReceiptLayout.Element> elements = role(layout, name);
        require(!elements.isEmpty(), "Missing display role " + name);
        return elements.get(0);
    }
    private static ReceiptLayout.Element last(ReceiptLayout layout, String name) {
        List<ReceiptLayout.Element> elements = role(layout, name);
        require(!elements.isEmpty(), "Missing display role " + name);
        return elements.get(elements.size() - 1);
    }
    private static String text(ReceiptLayout layout, String name) {
        return String.join(" ", role(layout, name).stream().filter(e -> e.kind == ReceiptLayout.Kind.TEXT).map(e -> e.text).toList());
    }
    private static String allText(ReceiptLayout layout) {
        return String.join(" ", layout.elements.stream().filter(e -> e.kind == ReceiptLayout.Kind.TEXT).map(e -> e.text).toList());
    }
    private static String compact(String value) {
        StringBuilder out = new StringBuilder();
        value.codePoints().filter(cp -> !Character.isWhitespace(cp) && !Character.isSpaceChar(cp)).forEach(out::appendCodePoint);
        return out.toString();
    }
    private static String money(long pence) { return String.format(java.util.Locale.ROOT, "£%d.%02d", pence / 100, pence % 100); }
    private static void preserved(String expected, String actual, String context) { equal(compact(expected), compact(actual), context); }
    private static void equal(String expected, String actual, String context) { require(expected.equals(actual), context); }
    private static void require(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
    private static void fails(Runnable operation, String expected) {
        try { operation.run(); }
        catch (IllegalArgumentException failure) { equal(expected, failure.getMessage(), "Expected layout rejection"); return; }
        throw new AssertionError("Oversize or unmeasurable receipt unexpectedly accepted");
    }
}
