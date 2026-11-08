package uk.co.mealdeck.printer;

import java.security.MessageDigest;
import java.util.HexFormat;

/** Checks native QR pixel identity against the independently decoded browser/TCP asset. */
public final class ReceiptGamesQrTest {
    private static void check(boolean value, String message) {
        if (!value) throw new AssertionError(message);
    }

    private static boolean pixel(int x, int y) {
        int row = y / ReceiptGamesQr.MODULE_PIXELS - ReceiptGamesQr.QUIET_ZONE;
        int column = x / ReceiptGamesQr.MODULE_PIXELS - ReceiptGamesQr.QUIET_ZONE;
        return row >= 0 && row < ReceiptGamesQr.MODULE_COUNT
            && column >= 0 && column < ReceiptGamesQr.MODULE_COUNT
            && ReceiptGamesQr.darkAt(row, column);
    }

    private static void rejects(int row, int column) {
        try {
            ReceiptGamesQr.darkAt(row, column);
            throw new AssertionError("Out-of-grid coordinate accepted");
        } catch (IllegalArgumentException expected) {
            check(expected.getMessage().equals("invalid_fixed_receipt_qr_coordinate"), "Stable bounded failure");
        }
    }

    public static void main(String[] args) throws Exception {
        check(ReceiptGamesQr.DESTINATION.equals("https://mealdeck.co.uk/play/receipt"), "Fixed public destination");
        check(ReceiptGamesQr.DISPLAY_URL.equals("mealdeck.co.uk/play"), "Approved short URL");
        check(ReceiptGamesQr.HEADING.equals("Got a minute? Play MealDeck"), "Approved heading");
        check(ReceiptGamesQr.SUBTITLE.equals("Scan for free food games"), "Approved subtitle");
        check(ReceiptGamesQr.MODULE_COUNT == 33, "Version-four grid");
        check(ReceiptGamesQr.QUIET_ZONE == 4, "Complete quiet zone");
        check(ReceiptGamesQr.MODULE_PIXELS == 6, "Six square pixels per module");
        check(ReceiptGamesQr.SIZE_PX == 246, "Whole QR size including quiet zone");
        check(ReceiptGamesQr.SIZE_PX == (ReceiptGamesQr.MODULE_COUNT + 2 * ReceiptGamesQr.QUIET_ZONE)
            * ReceiptGamesQr.MODULE_PIXELS, "Sizing includes both quiet-zone borders");

        int size = ReceiptGamesQr.SIZE_PX;
        int rowBytes = (size + 7) / 8;
        int quietPixels = ReceiptGamesQr.QUIET_ZONE * ReceiptGamesQr.MODULE_PIXELS;
        byte[] raster = new byte[rowBytes * size];
        for (int y = 0; y < size; y++) {
            for (int x = 0; x < size; x++) {
                boolean dark = pixel(x, y);
                if (x < quietPixels || y < quietPixels || x >= size - quietPixels || y >= size - quietPixels) {
                    check(!dark, "Every quiet-zone pixel stays white");
                }
                if (dark) raster[y * rowBytes + (x >> 3)] |= (byte) (0x80 >> (x & 7));
            }
            check((raster[(y + 1) * rowBytes - 1] & 3) == 0, "Unused row-padding bits stay white");
        }
        String hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(raster));
        check(hash.equals("63277bcfafd0e792b6d5d54befa95b9d4d8704ebbe184213b4c4fbca67e28229"),
            "Native pixels equal the trusted browser/TCP raster without rotation or border loss");
        check(hash.equals(ReceiptGamesQr.RASTER_SHA256), "Published asset digest matches");
        rejects(-1, 0);
        rejects(0, -1);
        rejects(ReceiptGamesQr.MODULE_COUNT, 0);
        rejects(0, ReceiptGamesQr.MODULE_COUNT);
        rejects(Integer.MAX_VALUE, Integer.MIN_VALUE);
        System.out.println("Native receipt games QR: trusted pixel identity, fixed URL, complete quiet zone and bounded coordinates passed.");
    }
}
