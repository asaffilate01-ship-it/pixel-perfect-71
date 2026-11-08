package uk.co.mealdeck.printer;

import java.math.BigInteger;
import java.util.Locale;

/** Rotation is based on canonical order identity, independent of receipt copies and IPC jobs. */
public final class ReceiptPromotionTest {
    private static final String ORDER_ID = "dddddddd-4444-4444-8444-444444444444";
    private static final String[] IDS = {"play", "tiktok", "instagram", "skorch", "tavo-chicken", "loadd", "moktl", "souvano"};

    private static void check(boolean value, String message) {
        if (!value) throw new AssertionError(message);
    }

    public static void main(String[] args) {
        check(ReceiptPromotion.COUNT == 8, "Eight fixed slots");
        for (int number = 1; number <= 32; number++) {
            String orderNumber = String.format(Locale.ROOT, "%04d", number);
            ReceiptPromotion.Slot slot = ReceiptPromotion.forOrder(orderNumber, ORDER_ID);
            check(slot.id.equals(IDS[(number - 1) % 8]), "Canonical sequence repeats every eight orders");
            check(ReceiptPromotion.forOrder(orderNumber, ORDER_ID) == slot, "Repeated rendering never advances the slot");
            check(slot.width > 0 && slot.width <= 288 && slot.height > 0 && slot.height <= 246, "Fixed image fits the paper");
            check(slot.resourceName.equals("receipt_promo_" + slot.id.replace('-', '_')), "Sealed bundled resource");
            check(slot.rasterSha256.matches("[0-9a-f]{64}"), "Fixed resource digest");
            check(slot.targetUrl != null == slot.kind.equals("qr"), "Only QR slots have fixed destinations");
        }
        for (String sequence : new String[]{"9999", "10000", "9007199254740992", "9007199254740993", "9223372036854775807", "9999999999999999999"}) {
            int expected = new BigInteger(sequence).subtract(BigInteger.ONE).mod(BigInteger.valueOf(8)).intValueExact();
            check(ReceiptPromotion.indexForOrder(sequence, ORDER_ID) == expected, "Decimal sequence does not lose numeric precision");
        }
        String[] legacyIds = {
            ORDER_ID, "00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002",
            "FFFFFFFF-FFFF-4FFF-8FFF-FFFFFFFFFFFF", "12345678-1234-4234-8234-123456789abc"
        };
        int[] legacyIndexes = {5, 2, 7, 1, 6};
        for (int i = 0; i < legacyIds.length; i++) {
            for (String missing : new String[]{null, "", "0000", "1", "00001", "1234x", "-1234"}) {
                check(ReceiptPromotion.indexForOrder(missing, legacyIds[i]) == legacyIndexes[i], "Legacy UUID matches shared unsigned FNV vectors");
                check(ReceiptPromotion.indexForOrder(missing, legacyIds[i].toLowerCase(Locale.ROOT)) == legacyIndexes[i], "UUID case is immaterial");
            }
        }
        for (String invalid : new String[]{null, "", "not-an-order", "https://example.invalid/"}) {
            try {
                ReceiptPromotion.indexForOrder(null, invalid);
                throw new AssertionError("Invalid order identity accepted");
            } catch (IllegalArgumentException expected) {
                check(expected.getMessage().contains("canonical order identity"), "Stable bounded validation");
            }
        }
        check(ReceiptPromotion.forOrder("0001", ORDER_ID).targetUrl.equals("https://mealdeck.co.uk/play"), "Approved games URL");
        check(ReceiptPromotion.forOrder("0002", ORDER_ID).targetUrl.equals("https://www.tiktok.com/@mealdeckofficial"), "Approved TikTok URL");
        check(ReceiptPromotion.forOrder("0003", ORDER_ID).targetUrl.equals("https://www.instagram.com/mealdeckofficial/"), "Approved Instagram URL");
        System.out.println("Native receipt promotions: eight-slot sequence, stable reprints, full decimal precision and legacy UUID parity passed.");
    }
}
