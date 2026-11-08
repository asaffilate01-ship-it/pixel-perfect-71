package uk.co.mealdeck.printer;

import java.util.regex.Pattern;
import org.json.JSONObject;

/**
 * A verified order-bound delivery address for the physical kitchen slip only.
 * Outside the frozen receipt fingerprint and the local dispatch journal.
 */
record ReceiptDelivery(String postcode, String doorNumber, String roadName, String addressLine2) {
    private static final Pattern POSTCODE = Pattern.compile("[A-Z]{1,2}[0-9][A-Z0-9]? [0-9][A-Z]{2}");

    static ReceiptDelivery fromResponse(JSONObject response, String orderId, String fulfilment) {
        if (response == null || orderId == null) throw invalid();
        JSONObject contact = response.optJSONObject("receiptContact");
        if (!"delivery".equals(fulfilment)) {
            if (contact != null && contact.has("deliveryAddress")) throw invalid();
            return null;
        }
        if (contact == null || !orderId.equals(contact.optString("orderId"))
            || !contact.has("deliveryAddress") || contact.length() != 4) throw invalid();
        JSONObject address = contact.optJSONObject("deliveryAddress");
        if (address == null || address.length() != 4) throw invalid();
        String postcode = field(address, "postcode", 5, 8, false);
        String number = field(address, "doorNumber", 1, 40, false);
        String road = field(address, "roadName", 2, 120, false);
        String line2 = field(address, "addressLine2", 0, 120, true);
        if (!POSTCODE.matcher(postcode).matches()) throw invalid();
        return new ReceiptDelivery(postcode, number, road, line2);
    }

    private static String field(JSONObject object, String key, int min, int max, boolean optional) {
        Object raw = object.opt(key);
        if (!(raw instanceof String text) || (!optional && text.isBlank())
            || text.length() < min || text.length() > max) throw invalid();
        for (int n = 0; n < text.length();) {
            int point = text.codePointAt(n);
            int type = Character.getType(point);
            if (type == Character.CONTROL || type == Character.FORMAT) throw invalid();
            n += Character.charCount(point);
        }
        return text.trim();
    }

    private static PrinterFailure invalid() { return new PrinterFailure("receipt_held"); }
}
