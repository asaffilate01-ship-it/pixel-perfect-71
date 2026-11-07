package uk.co.mealdeck.printer;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Independent native validator for the version-one canonical receipt contract.
 * The insertion order and JSON string escaping deliberately match receipt.mjs.
 * No raw receipt data is included in exception messages or persisted here. */
public final class ReceiptModel {
    private static final Pattern UUID = Pattern.compile("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");
    private static final Pattern LINE = Pattern.compile("[a-zA-Z0-9][a-zA-Z0-9:_-]{0,99}");
    private static final Pattern ISO = Pattern.compile("(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2})(?::(\\d{2})(?:\\.(\\d+))?)?([Zz]|[+-]\\d{2}:?\\d{2})?");
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("uuuu-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT).withZone(ZoneOffset.UTC);
    public final String orderId;
    public final String fingerprint;
    public final String reprintOf;
    public final String normalizedJson;
    public final int copyNumber;

    private ReceiptModel(Map<String, Object> normalized) {
        orderId = (String) normalized.get("orderId");
        copyNumber = ((Number) normalized.get("copyNumber")).intValue();
        reprintOf = (String) normalized.get("reprintOf");
        normalizedJson = json(normalized);
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(normalizedJson.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(64);
            for (byte b : digest) hex.append(String.format(Locale.ROOT, "%02x", b & 255));
            fingerprint = hex.toString();
        } catch (Exception unavailable) { throw error("receipt_fingerprint_unavailable"); }
    }

    /** Returned object is a fresh copy, so callers cannot mutate the fingerprinted model. */
    public JSONObject toJson() {
        try { return new JSONObject(normalizedJson); }
        catch (JSONException impossible) { throw error("invalid_receipt"); }
    }

    public static ReceiptModel parse(JSONObject raw) {
        JSONObject r = object(raw,
            "schemaVersion orderId copyNumber reprintOf reprintReason displayCode brand tradingName locationName createdAt paidAt acceptedAt fulfilment customerName car cutleryRequested packingPlan items subtotalPence discountPence totalPence currency orderNotes",
            "orderNumber paymentMethod");
        require(numberEquals(value(r, "schemaVersion"), 1) && "MealDeck".equals(value(r, "brand")) &&
            "313 Brands Ltd".equals(value(r, "tradingName")) && "GBP".equals(value(r, "currency")), "unsupported_receipt_schema");
        String fulfilment = stringChoice(value(r, "fulfilment"), "unsupported_receipt_fulfilment", "pickup", "curbside");
        long copy = integer(value(r, "copyNumber"), 1, 100);
        String parentCopy = value(r, "reprintOf") == null ? null : identifier(value(r, "reprintOf"), UUID);
        String reason = nullableText(value(r, "reprintReason"), 300);
        require(copy == 1 ? parentCopy == null && reason == null : parentCopy != null && reason != null && !reason.isEmpty(), "invalid_reprint_receipt");

        List<Object> items = new ArrayList<>();
        Map<String, Map<String, Object>> byLine = new LinkedHashMap<>();
        JSONArray rawItems = list(value(r, "items"), 1, 180);
        for (int n = 0; n < rawItems.length(); n++) {
            JSONObject item = object(rawItems.opt(n), "lineId parentLineId brandName name quantity baseUnitPence unitPence linePence notes modifiers", "mealComponents");
            long quantity = integer(value(item, "quantity"), 1, 999);
            long base = integer(value(item, "baseUnitPence"));
            long unit = integer(value(item, "unitPence"));
            long line = integer(value(item, "linePence"));
            List<Object> modifiers = new ArrayList<>();
            long computed = base;
            JSONArray rawModifiers = list(value(item, "modifiers"), 0, 100);
            for (int m = 0; m < rawModifiers.length(); m++) {
                JSONObject mod = object(rawModifiers.opt(m), "name groupName quantityPerParent priceDeltaPence", "");
                String modName = text(value(mod, "name"), 1000, false);
                String group = text(value(mod, "groupName"), 1000, true);
                long count = integer(value(mod, "quantityPerParent"), 1, 999);
                long delta = integer(value(mod, "priceDeltaPence"), -1_000_000, 1_000_000);
                modifiers.add(map("name", modName, "groupName", group, "quantityPerParent", count, "priceDeltaPence", delta));
                computed += delta * count;
            }
            List<Object> components = null;
            if (item.has("mealComponents")) {
                components = new ArrayList<>();
                Set<String> slots = new HashSet<>();
                JSONArray rawComponents = list(value(item, "mealComponents"), 0, 3);
                for (int m = 0; m < rawComponents.length(); m++) {
                    JSONObject component = object(rawComponents.opt(m), "slot name quantityPerParent replacement", "");
                    String slot = stringChoice(value(component, "slot"), "invalid_meal_component", "main", "side", "drink");
                    String name = text(value(component, "name"), 1000, false);
                    require(name.equals(value(component, "name")), "invalid_meal_component");
                    boolean replacement = bool(value(component, "replacement"));
                    require(!slot.equals("main") || !replacement, "invalid_meal_component");
                    require(slots.add(slot), "invalid_meal_component");
                    components.add(map("slot", slot, "name", name, "quantityPerParent", integer(value(component, "quantityPerParent"), 1, 999), "replacement", replacement));
                }
            }
            require(computed == unit && unit * quantity == line, "receipt_line_total_mismatch");
            String id = identifier(value(item, "lineId"), LINE);
            Map<String, Object> normalized = map(
                "lineId", id,
                "parentLineId", value(item, "parentLineId") == null ? null : identifier(value(item, "parentLineId"), LINE),
                "brandName", text(value(item, "brandName"), 140, false),
                "name", text(value(item, "name"), 1000, false),
                "quantity", quantity, "baseUnitPence", base, "unitPence", unit, "linePence", line,
                "notes", nullableText(value(item, "notes"), 20000), "modifiers", modifiers);
            if (components != null) normalized.put("mealComponents", components);
            items.add(normalized);
            require(byLine.put(id, normalized) == null, "duplicate_receipt_line");
        }
        for (Map<String, Object> item : byLine.values()) {
            if (item.get("parentLineId") == null) continue;
            Map<String, Object> parent = byLine.get((String) item.get("parentLineId"));
            require(parent != null && parent.get("parentLineId") == null && !parent.get("lineId").equals(item.get("lineId")) && parent.get("quantity").equals(item.get("quantity")), "invalid_receipt_parent");
        }

        JSONObject plan = object(value(r, "packingPlan"), "version separateBags cutleryRequested bags", "");
        require(numberEquals(value(plan, "version"), 1), "unsupported_packing_plan");
        boolean cutlery = bool(value(r, "cutleryRequested"));
        require(bool(value(plan, "cutleryRequested")) == cutlery, "cutlery_mismatch");
        Map<String, Long> allocated = new HashMap<>();
        List<Object> bags = new ArrayList<>();
        JSONArray rawBags = list(value(plan, "bags"), 1, 10);
        for (int n = 0; n < rawBags.length(); n++) {
            JSONObject bag = object(rawBags.opt(n), "number allocations", "name");
            String name = bag.has("name") ? packingName(value(bag, "name")) : null;
            require(integer(value(bag, "number"), 1, 10) == n + 1, "invalid_bag_number");
            Map<String, Long> perBag = new HashMap<>();
            List<Object> allocations = new ArrayList<>();
            JSONArray rawAllocations = list(value(bag, "allocations"), 1, 180);
            for (int a = 0; a < rawAllocations.length(); a++) {
                JSONObject allocation = object(rawAllocations.opt(a), "lineId quantity", "");
                String id = identifier(value(allocation, "lineId"), LINE);
                long count = integer(value(allocation, "quantity"), 1, 999);
                require(byLine.containsKey(id) && !perBag.containsKey(id), "invalid_bag_allocation");
                perBag.put(id, count);
                allocated.put(id, allocated.getOrDefault(id, 0L) + count);
                allocations.add(map("lineId", id, "quantity", count));
            }
            for (Map<String, Object> item : byLine.values()) if (item.get("parentLineId") != null)
                require(perBag.getOrDefault((String) item.get("lineId"), 0L).equals(perBag.getOrDefault((String) item.get("parentLineId"), 0L)), "extra_bag_mismatch");
            Map<String, Object> normalized = map("number", n + 1);
            if (bag.has("name")) normalized.put("name", name);
            normalized.put("allocations", allocations);
            bags.add(normalized);
        }
        for (Map<String, Object> item : byLine.values()) require(item.get("quantity").equals(allocated.get((String) item.get("lineId"))), "packing_quantity_mismatch");
        boolean separate = bool(value(plan, "separateBags"));
        require(separate || bags.size() == 1, "packing_bag_count_mismatch");
        long subtotal = integer(value(r, "subtotalPence"));
        long discount = integer(value(r, "discountPence"));
        long total = integer(value(r, "totalPence"));
        long computedTotal = 0;
        for (Map<String, Object> item : byLine.values()) computedTotal += (Long) item.get("linePence");
        require(computedTotal == subtotal && discount <= subtotal && subtotal - discount == total, "receipt_total_mismatch");
        Map<String, Object> car = null;
        if (value(r, "car") != null) {
            JSONObject details = object(value(r, "car"), "make colour registrationLast4", "");
            String registration = text(value(details, "registrationLast4"), 4, false).toUpperCase(Locale.ROOT);
            require(registration.matches("[A-Z0-9]{4}"), "invalid_receipt_car");
            car = map("make", text(value(details, "make"), 100, false), "colour", text(value(details, "colour"), 100, false), "registrationLast4", registration);
        }
        require(fulfilment.equals("curbside") ? car != null : car == null, "receipt_car_fulfilment_mismatch");
        String created = timestamp(value(r, "createdAt"));
        String paid = timestamp(value(r, "paidAt"));
        String accepted = timestamp(value(r, "acceptedAt"));
        require(Instant.parse(paid).compareTo(Instant.parse(created)) >= 0 && Instant.parse(accepted).compareTo(Instant.parse(paid)) >= 0, "receipt_time_mismatch");
        Object display = value(r, "displayCode");
        require(display instanceof String && ((String) display).matches("[0-9]{4}"), "invalid_receipt_display_code");
        Object orderNumber = value(r, "orderNumber");
        require(!r.has("orderNumber") || orderNumber == null || (orderNumber instanceof String && ((String) orderNumber).matches("(?!0000$)(?:[0-9]{4}|[1-9][0-9]{4,18})")), "invalid_receipt_order_number");
        if (r.has("paymentMethod")) stringChoice(value(r, "paymentMethod"), "invalid_receipt_payment_method", "card", "cash");
        Map<String, Object> normalized = map("schemaVersion", 1, "orderId", identifier(value(r, "orderId"), UUID), "copyNumber", copy,
            "reprintOf", parentCopy, "reprintReason", reason, "displayCode", display);
        if (r.has("orderNumber")) normalized.put("orderNumber", orderNumber);
        if (r.has("paymentMethod")) normalized.put("paymentMethod", value(r, "paymentMethod"));
        normalized.putAll(map("brand", "MealDeck", "tradingName", "313 Brands Ltd", "locationName", text(value(r, "locationName"), 140, false),
            "createdAt", created, "paidAt", paid, "acceptedAt", accepted, "fulfilment", fulfilment,
            "customerName", text(value(r, "customerName"), 200, false), "car", car, "cutleryRequested", cutlery,
            "packingPlan", map("version", 1, "separateBags", separate, "cutleryRequested", cutlery, "bags", bags),
            "items", items, "subtotalPence", subtotal, "discountPence", discount, "totalPence", total, "currency", "GBP",
            "orderNotes", nullableText(value(r, "orderNotes"), 20000)));
        return new ReceiptModel(normalized);
    }

    private static Object value(JSONObject object, String key) {
        Object value = object.opt(key);
        return value == JSONObject.NULL ? null : value;
    }
    private static JSONObject object(Object value, String required, String optional) {
        require(value instanceof JSONObject, "invalid_receipt");
        JSONObject object = (JSONObject) value;
        Set<String> allowed = new HashSet<>(Arrays.asList(required.split(" ")));
        for (String key : required.split(" ")) require(object.has(key), "unexpected_receipt_fields");
        if (!optional.isEmpty()) allowed.addAll(Arrays.asList(optional.split(" ")));
        Iterator<String> keys = object.keys();
        while (keys.hasNext()) require(allowed.contains(keys.next()), "unexpected_receipt_fields");
        return object;
    }
    private static JSONArray list(Object value, int min, int max) {
        require(value instanceof JSONArray && ((JSONArray) value).length() >= min && ((JSONArray) value).length() <= max, "receipt_bounds_exceeded");
        return (JSONArray) value;
    }
    private static boolean numberEquals(Object value, long expected) {
        return value instanceof Number && ((Number) value).doubleValue() == expected;
    }
    private static long integer(Object value) { return integer(value, 0, 10_000_000); }
    private static long integer(Object value, long min, long max) {
        require(value instanceof Number, "invalid_receipt_number");
        double n = ((Number) value).doubleValue();
        require(Double.isFinite(n) && n == Math.rint(n) && Math.abs(n) <= 9_007_199_254_740_991d && n >= min && n <= max, "invalid_receipt_number");
        return (long) n;
    }
    private static boolean bool(Object value) {
        require(value instanceof Boolean, "invalid_receipt");
        return (Boolean) value;
    }
    private static String identifier(Object value, Pattern pattern) {
        require(value instanceof String && pattern.matcher((String) value).matches(), "invalid_receipt_identifier");
        return (String) value;
    }
    private static String stringChoice(Object value, String code, String... choices) {
        require(value instanceof String && Arrays.asList(choices).contains(value), code);
        return (String) value;
    }
    private static String nullableText(Object value, int max) { return value == null ? null : text(value, max, true); }
    private static String text(Object value, int max, boolean allowEmpty) {
        require(value instanceof String && ((String) value).length() <= max, "invalid_receipt");
        String spaces = ((String) value).replace('\t', ' ').replace('\n', ' ').replace('\r', ' ');
        for (int offset = 0; offset < spaces.length();) {
            int cp = spaces.codePointAt(offset);
            int type = Character.getType(cp);
            require(type != Character.CONTROL && type != Character.FORMAT, "invalid_receipt_text");
            offset += Character.charCount(cp);
        }
        String clean = trim(spaces);
        require(allowEmpty || !clean.isEmpty(), "invalid_receipt_text");
        return clean;
    }
    private static String packingName(Object value) {
        require(value instanceof String, "invalid_packing_name");
        String name = (String) value;
        require(!name.isEmpty() && name.codePointCount(0, name.length()) <= 32 && name.equals(trim(name.replaceAll("[ \\u00a0\\u1680\\u2000-\\u200a\\u202f\\u205f\\u3000\\ufeff]+", " "))), "invalid_packing_name");
        for (int offset = 0; offset < name.length();) {
            int cp = name.codePointAt(offset);
            require(Character.getType(cp) != Character.CONTROL && cp != 0x61c && cp != 0x200e && cp != 0x200f && !(cp >= 0x2028 && cp <= 0x202e) && !(cp >= 0x2066 && cp <= 0x2069), "invalid_packing_name");
            offset += Character.charCount(cp);
        }
        return name;
    }
    private static boolean whitespace(char c) {
        return c == 0x0009 || c == 0x000a || c == 0x000b || c == 0x000c || c == 0x000d || c == 0x0020 || c == 0x00a0 || c == 0x1680 || (c >= 0x2000 && c <= 0x200a) || c == 0x2028 || c == 0x2029 || c == 0x202f || c == 0x205f || c == 0x3000 || c == 0xfeff;
    }
    private static String trim(String input) {
        int start = 0, end = input.length();
        while (start < end && whitespace(input.charAt(start))) start++;
        while (end > start && whitespace(input.charAt(end - 1))) end--;
        return input.substring(start, end);
    }
    private static String timestamp(Object value) {
        require(value instanceof String && ((String) value).length() <= 40, "invalid_receipt_timestamp");
        Matcher match = ISO.matcher((String) value);
        require(match.matches(), "invalid_receipt_timestamp");
        try {
            int year = Integer.parseInt(match.group(1)), month = Integer.parseInt(match.group(2)), day = Integer.parseInt(match.group(3));
            int hour = Integer.parseInt(match.group(4)), minute = Integer.parseInt(match.group(5));
            int second = match.group(6) == null ? 0 : Integer.parseInt(match.group(6));
            String fraction = match.group(7);
            int millis = fraction == null ? 0 : Integer.parseInt((fraction + "000").substring(0, 3));
            require(day >= 1 && day <= 31 && hour <= 24 && minute <= 59 && second <= 59 && (hour < 24 || (minute == 0 && second == 0 && (fraction == null || fraction.matches("0+")))), "invalid_receipt_timestamp");
            LocalDateTime local = LocalDate.of(year, month, 1).plusDays(day - 1L).atStartOfDay().plusHours(hour).plusMinutes(minute).plusSeconds(second).plusNanos(millis * 1_000_000L);
            String zone = match.group(8);
            Instant instant;
            if (zone == null) instant = local.atZone(ZoneId.systemDefault()).toInstant();
            else if (zone.equalsIgnoreCase("Z")) instant = local.toInstant(ZoneOffset.UTC);
            else {
                String digits = zone.substring(1).replace(":", "");
                int hours = Integer.parseInt(digits.substring(0, 2)), minutes = Integer.parseInt(digits.substring(2));
                require(hours <= 23 && minutes <= 59, "invalid_receipt_timestamp");
                long offset = (hours * 60L + minutes) * 60 * (zone.charAt(0) == '-' ? -1 : 1);
                instant = local.toInstant(ZoneOffset.UTC).minusSeconds(offset);
            }
            int utcYear = instant.atOffset(ZoneOffset.UTC).getYear();
            if (utcYear >= 0 && utcYear <= 9999) return DATE.format(instant);
            return String.format(Locale.ROOT, "%+07d", utcYear) + DateTimeFormatter.ofPattern("-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT).withZone(ZoneOffset.UTC).format(instant);
        } catch (RuntimeException invalid) { throw error("invalid_receipt_timestamp"); }
    }
    private static Map<String, Object> map(Object... pairs) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (int n = 0; n < pairs.length; n += 2) out.put((String) pairs[n], pairs[n + 1]);
        return out;
    }
    private static String json(Object value) {
        if (value == null) return "null";
        if (value instanceof String) return quote((String) value);
        if (value instanceof Number || value instanceof Boolean) return value.toString();
        StringBuilder out = new StringBuilder();
        if (value instanceof Map) {
            out.append('{');
            for (Map.Entry<?, ?> entry : ((Map<?, ?>) value).entrySet()) {
                if (out.length() > 1) out.append(',');
                out.append(quote((String) entry.getKey())).append(':').append(json(entry.getValue()));
            }
            return out.append('}').toString();
        }
        out.append('[');
        for (Object entry : (List<?>) value) {
            if (out.length() > 1) out.append(',');
            out.append(json(entry));
        }
        return out.append(']').toString();
    }
    private static String quote(String value) {
        StringBuilder out = new StringBuilder("\"");
        for (int n = 0; n < value.length(); n++) {
            char c = value.charAt(n);
            if (c == '"' || c == '\\') out.append('\\').append(c);
            else if (c == '\b') out.append("\\b");
            else if (c == '\f') out.append("\\f");
            else if (c == '\n') out.append("\\n");
            else if (c == '\r') out.append("\\r");
            else if (c == '\t') out.append("\\t");
            else if (c < 0x20 || (Character.isHighSurrogate(c) && (n + 1 == value.length() || !Character.isLowSurrogate(value.charAt(n + 1)))) || (Character.isLowSurrogate(c) && (n == 0 || !Character.isHighSurrogate(value.charAt(n - 1))))) out.append(String.format(Locale.ROOT, "\\u%04x", (int) c));
            else out.append(c);
        }
        return out.append('"').toString();
    }
    private static IllegalArgumentException error(String code) { return new IllegalArgumentException(code); }
    private static void require(boolean condition, String code) { if (!condition) throw error(code); }
}
