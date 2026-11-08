package uk.co.mealdeck.printer;

import static org.junit.Assert.*;
import org.json.JSONObject;
import org.junit.Test;

public final class ReceiptDeliveryUnitTest {
    private static final String ORDER = "00000000-0000-4000-8000-000000000001";

    private static JSONObject response(String order) throws Exception {
        return new JSONObject().put("receiptContact", new JSONObject()
            .put("schemaVersion", 1).put("orderId", order)
            .put("customerPhone", "+447700900123")
            .put("deliveryAddress", new JSONObject()
                .put("postcode", "LU4 8NU").put("doorNumber", "14")
                .put("roadName", "Selbourne Road").put("addressLine2", "Flat 2")));
    }

    @Test public void acceptsOnlyAnOrderBoundDeliveryAddress() throws Exception {
        JSONObject original = response(ORDER);
        String serialized = original.toString();
        ReceiptDelivery address = ReceiptDelivery.fromResponse(original, ORDER, "delivery");
        assertEquals("LU4 8NU", address.postcode());
        assertEquals("14 Selbourne Road", address.doorNumber() + " " + address.roadName());
        assertEquals("Flat 2", address.addressLine2());
        assertEquals(serialized, original.toString());
    }

    @Test public void rejectsMissingMismatchAndInjection() throws Exception {
        fails(new JSONObject(), "delivery");
        fails(response("00000000-0000-4000-8000-000000000002"), "delivery");
        JSONObject newline = response(ORDER);
        newline.getJSONObject("receiptContact").getJSONObject("deliveryAddress")
            .put("roadName", "Main Road\nNew Order");
        fails(newline, "delivery");
        JSONObject extra = response(ORDER);
        extra.getJSONObject("receiptContact").getJSONObject("deliveryAddress")
            .put("email", "private@example.invalid");
        fails(extra, "delivery");
        JSONObject wrongPostcode = response(ORDER);
        wrongPostcode.getJSONObject("receiptContact").getJSONObject("deliveryAddress")
            .put("postcode", "LONDON");
        fails(wrongPostcode, "delivery");
        fails(response(ORDER), "pickup");
        fails(response(ORDER), "curbside");
        assertNull(ReceiptDelivery.fromResponse(new JSONObject(), ORDER, "pickup"));
    }

    private static void fails(JSONObject response, String fulfilment) {
        PrinterFailure failure = assertThrows(PrinterFailure.class,
            () -> ReceiptDelivery.fromResponse(response, ORDER, fulfilment));
        assertEquals("receipt_held", failure.getMessage());
    }
}
