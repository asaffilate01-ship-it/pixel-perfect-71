package uk.co.mealdeck.printer;

import java.util.regex.Pattern;
import org.json.JSONObject;

/** Optional, order-bound presentation data outside the immutable receipt model.
 * Never falls back to a mutable customer profile or logs contact information. */
final class ReceiptContact {
    private static final Pattern PHONE = Pattern.compile("\\+[1-9][0-9]{7,14}");

    private ReceiptContact() {}

    static String phoneFromResponse(JSONObject response, String expectedOrderId) {
        if (response == null || expectedOrderId == null) throw invalid();
        // Older server projections contain no optional contact extension.
        if (!response.has("receiptContact") || response.isNull("receiptContact")) return null;
        JSONObject contact = response.optJSONObject("receiptContact");
        if (contact == null || contact.length() != 3
            || !contact.has("schemaVersion") || !contact.has("orderId") || !contact.has("customerPhone")
            || !(contact.opt("schemaVersion") instanceof Number version) || version.doubleValue() != 1
            || !expectedOrderId.equals(contact.opt("orderId"))) throw invalid();
        if (contact.isNull("customerPhone")) return null;
        Object value = contact.opt("customerPhone");
        if (!(value instanceof String phone) || !PHONE.matcher(phone).matches()) throw invalid();
        return phone;
    }

    private static PrinterFailure invalid() { return new PrinterFailure("receipt_held"); }
}
