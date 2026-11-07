package uk.co.mealdeck.printer;

import static org.junit.Assert.*;
import org.json.JSONObject;
import org.junit.Test;

public final class ReceiptContactUnitTest {
    private static final String ORDER = "00000000-0000-4000-8000-000000000001";
    private static JSONObject response(Object phone) throws Exception {
        return new JSONObject().put("receiptContact", new JSONObject()
            .put("schemaVersion", 1).put("orderId", ORDER)
            .put("customerPhone", phone == null ? JSONObject.NULL : phone));
    }

    @Test public void acceptsSavedOrderPhoneWithoutChangingReceiptData() throws Exception {
        JSONObject response = response("+447700900123");
        response.put("receipt", new JSONObject().put("orderId", ORDER));
        String before = response.toString();
        assertEquals("+447700900123", ReceiptContact.phoneFromResponse(response, ORDER));
        assertEquals(before, response.toString());
        assertNull(ReceiptContact.phoneFromResponse(response(null), ORDER));
        assertNull(ReceiptContact.phoneFromResponse(new JSONObject(), ORDER));
        assertNull(ReceiptContact.phoneFromResponse(new JSONObject().put("receiptContact", JSONObject.NULL), ORDER));
    }

    @Test public void rejectsWrongOrderMalformedFieldsAndUnsafePhone() throws Exception {
        JSONObject wrongOrder = response("+447700900123");
        wrongOrder.getJSONObject("receiptContact").put("orderId", "00000000-0000-4000-8000-000000000002");
        assertInvalid(wrongOrder);
        for (Object phone : new Object[] { "07700900123", "+44 7700 900123", "+447700900123\n", "+447700900123\u202e", "", "+1", 447700900123L })
            assertInvalid(response(phone));
        for (Object version : new Object[] { "1", 0, 2, true, JSONObject.NULL }) {
            JSONObject invalid = response("+447700900123");
            invalid.getJSONObject("receiptContact").put("schemaVersion", version);
            assertInvalid(invalid);
        }
        JSONObject extra = response(null);
        extra.getJSONObject("receiptContact").put("email", "private@example.invalid");
        assertInvalid(extra);
        JSONObject missing = response(null);
        missing.getJSONObject("receiptContact").remove("customerPhone");
        assertInvalid(missing);
        assertInvalid(new JSONObject().put("receiptContact", "+447700900123"));
    }

    private static void assertInvalid(JSONObject response) {
        PrinterFailure failure = assertThrows(PrinterFailure.class,
            () -> ReceiptContact.phoneFromResponse(response, ORDER));
        assertEquals("receipt_held", failure.getMessage());
    }
}
