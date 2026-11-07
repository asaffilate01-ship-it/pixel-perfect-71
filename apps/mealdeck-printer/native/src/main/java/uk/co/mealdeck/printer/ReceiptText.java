package uk.co.mealdeck.printer;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.Normalizer;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Bounded text layout shared by bitmap rendering and JVM golden-contract checks.
 * Uses the bridge's explicit ASCII fallback, including its visible warning. */
final class ReceiptText {
    static final int COLUMNS = 32;
    static final int MAX_LINES = 600;
    private static final int MAX_BYTES = 32768;
    private static final int LOGO_AND_COMMAND_BYTES = 8286;
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd/MM/yyyy, HH:mm", Locale.UK).withZone(ZoneId.of("Europe/London"));
    private final List<String> lines = new ArrayList<>();
    private boolean replacedCharacters;

    static List<String> layout(ReceiptModel model) {
        return new ReceiptText().build(model.toJson());
    }

    private List<String> build(JSONObject receipt) {
        JSONArray items = receipt.optJSONArray("items");
        JSONArray bags = receipt.optJSONObject("packingPlan").optJSONArray("bags");
        Map<String, JSONObject> byLine = new HashMap<>();
        for (int n = 0; n < items.length(); n++) {
            JSONObject item = items.optJSONObject(n);
            byLine.put(item.optString("lineId"), item);
        }
        String rule = "-".repeat(COLUMNS);
        write("MEALDECK");
        write(receipt.optString("locationName"));
        String orderNumber = nullable(receipt, "orderNumber");
        write("ORDER " + (orderNumber == null ? receipt.optString("displayCode") : orderNumber));
        if (orderNumber != null) write("Collection code: " + receipt.optString("displayCode"));
        if (receipt.optInt("copyNumber") > 1) {
            write("REPRINT - COPY " + receipt.optInt("copyNumber"));
            write("Reason: " + receipt.optString("reprintReason"));
        }
        write("Placed / paid: " + DATE.format(Instant.parse(receipt.optString("paidAt"))));
        write("Accepted: " + DATE.format(Instant.parse(receipt.optString("acceptedAt"))));
        write(receipt.optString("fulfilment").equals("curbside") ? "KERBSIDE PICKUP" : "COLLECTION");
        if (receipt.optString("paymentMethod").equals("cash")) write("PAYMENT: CASH PAID");
        write("Name: " + receipt.optString("customerName"));
        JSONObject car = receipt.optJSONObject("car");
        if (car != null) write("Car: " + car.optString("colour") + " " + car.optString("make") + " / last 4: " + car.optString("registrationLast4"));
        write(rule);
        for (int n = 0; n < items.length(); n++) {
            JSONObject item = items.optJSONObject(n);
            write(item.optString("brandName").toUpperCase(Locale.ROOT));
            pair(item.optInt("quantity") + " x " + item.optString("name"), money(item.optLong("linePence")));
            List<String> allocated = new ArrayList<>();
            for (int b = 0; b < bags.length(); b++) {
                JSONObject bag = bags.optJSONObject(b);
                JSONArray allocations = bag.optJSONArray("allocations");
                for (int a = 0; a < allocations.length(); a++) {
                    JSONObject allocation = allocations.optJSONObject(a);
                    if (allocation.optString("lineId").equals(item.optString("lineId")))
                        allocated.add(printable(bagName(bag)) + " x" + allocation.optInt("quantity"));
                }
            }
            write("Packing: " + String.join(", ", allocated), "  ");
            String parent = nullable(item, "parentLineId");
            if (parent != null) write("Extra for " + byLine.get(parent).optString("name"), "  ");
            JSONArray components = item.optJSONArray("mealComponents");
            if (components != null && components.length() > 0) {
                write("MEAL INCLUDES:", "  ");
                for (int c = 0; c < components.length(); c++) {
                    JSONObject component = components.optJSONObject(c);
                    String replacement = component.optBoolean("replacement") ? " - replaces standard " + (component.optString("slot").equals("drink") ? "drink" : "side") : "";
                    write(item.optInt("quantity") * component.optInt("quantityPerParent") + " x " + component.optString("name") + replacement, "  ");
                }
            }
            JSONArray modifiers = item.optJSONArray("modifiers");
            if (modifiers.length() > 0) {
                pair("  Each, including choices", money(item.optLong("unitPence")));
                write("Choices included in item price:", "  ");
                for (int m = 0; m < modifiers.length(); m++) {
                    JSONObject modifier = modifiers.optJSONObject(m);
                    write(modifier.optString("groupName") + ": " + modifier.optString("name") + " x" + modifier.optInt("quantityPerParent") + " per item", "  ");
                }
            }
            String note = nullable(item, "notes");
            if (note != null && !note.isEmpty()) write("Note: " + note, "  ");
            write("");
        }
        write(rule);
        pair("Subtotal", money(receipt.optLong("subtotalPence")));
        if (receipt.optLong("discountPence") > 0) pair("Discount", "-" + money(receipt.optLong("discountPence")));
        pair("TOTAL", money(receipt.optLong("totalPence")));
        write(rule);
        write("PACKING - " + bags.length() + " BAG" + (bags.length() == 1 ? "" : "S"));
        for (int b = 0; b < bags.length(); b++) {
            JSONObject bag = bags.optJSONObject(b);
            write("BAG " + bag.optInt("number") + " OF " + bags.length());
            if (bag.has("name")) write("For: " + printable(bag.optString("name")));
            JSONArray allocations = bag.optJSONArray("allocations");
            for (int a = 0; a < allocations.length(); a++) {
                JSONObject allocation = allocations.optJSONObject(a);
                JSONObject item = byLine.get(allocation.optString("lineId"));
                write(allocation.optInt("quantity") + " x " + item.optString("brandName") + " - " + item.optString("name"), "  ");
            }
        }
        write("CUTLERY: " + (receipt.optBoolean("cutleryRequested") ? "REQUESTED" : "NOT REQUESTED"));
        String note = nullable(receipt, "orderNotes");
        if (note != null && !note.isEmpty()) {
            write(rule);
            write("Order note: " + note);
        }
        if (replacedCharacters) write("Some characters shown as ?. Check the order screen.");
        write(rule);
        write("MealDeck is a trading name of");
        write("313 Brands Ltd");
        write("Powered by Dishbee");
        write("mealdeck.co.uk");
        write("END OF RECEIPT");
        int bytes = LOGO_AND_COMMAND_BYTES + 4;
        for (int n = 0; n < lines.size(); n++) bytes += lines.get(n).length() + (n == 0 ? 0 : 1);
        if (bytes > MAX_BYTES) throw new IllegalArgumentException("receipt_too_long");
        return Collections.unmodifiableList(new ArrayList<>(lines));
    }

    private static String nullable(JSONObject object, String key) {
        return !object.has(key) || object.isNull(key) ? null : object.optString(key);
    }
    private static String bagName(JSONObject bag) {
        String number = "Bag " + bag.optInt("number");
        return bag.has("name") ? bag.optString("name") + " · " + number : number;
    }
    private static String money(long pence) {
        return String.format(Locale.ROOT, "GBP %d.%02d", pence / 100, pence % 100);
    }
    private void pair(String label, String value) {
        String a = printable(label), b = printable(value);
        if (a.length() + b.length() + 1 <= COLUMNS) write(a + " ".repeat(COLUMNS - a.length() - b.length()) + b);
        else { write(label); write(value, "  "); }
    }
    private void write(String value) { write(value, ""); }
    private void write(String value, String indent) {
        String remaining = printable(value.trim());
        int width = COLUMNS - indent.length();
        if (remaining.isEmpty()) append("");
        while (!remaining.isEmpty()) {
            int count = Math.min(width, remaining.length());
            if (remaining.length() > width) {
                int boundary = remaining.lastIndexOf(' ', width);
                if (boundary > width / 2) count = boundary;
            }
            append(indent + remaining.substring(0, count));
            remaining = remaining.substring(count).stripLeading();
        }
    }
    private void append(String value) {
        lines.add(value);
        if (lines.size() > MAX_LINES) throw new IllegalArgumentException("receipt_too_long");
    }
    private String printable(String raw) {
        String punctuation = raw.replace('‘', '\'').replace('’', '\'').replace('“', '"').replace('”', '"')
            .replace('–', '-').replace('—', '-').replace("…", "...").replace("£", "GBP ").replace('•', '-').replace('·', '-');
        String decomposed = Normalizer.normalize(punctuation, Normalizer.Form.NFKD);
        StringBuilder out = new StringBuilder();
        for (int offset = 0; offset < decomposed.length();) {
            int cp = decomposed.codePointAt(offset);
            int type = Character.getType(cp);
            if (type != Character.NON_SPACING_MARK && type != Character.COMBINING_SPACING_MARK && type != Character.ENCLOSING_MARK) {
                if (cp >= 32 && cp <= 126) out.append((char) cp);
                else {
                    replacedCharacters = true;
                    // JS receipt.mjs's ASCII fallback operates on UTF-16 units.
                    for (int n = 0; n < Character.charCount(cp); n++) out.append('?');
                }
            }
            offset += Character.charCount(cp);
        }
        return out.toString();
    }
}
