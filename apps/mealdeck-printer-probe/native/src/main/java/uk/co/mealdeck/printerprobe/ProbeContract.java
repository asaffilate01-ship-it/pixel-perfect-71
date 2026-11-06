package uk.co.mealdeck.printerprobe;

import java.util.Locale;
import java.util.regex.Pattern;

/** Only the two reviewed, non-firmware Binder operations used by this probe. */
final class ProbeContract {
    static final String SERVICE_PACKAGE = "recieptservice.com.recieptservice";
    static final String SERVICE_CLASS = SERVICE_PACKAGE + ".service.PrinterService";
    static final String DESCRIPTOR = SERVICE_PACKAGE + ".PrinterInterface";
    // FIRST_CALL_TRANSACTION is 1. The reviewed generated interface adds 1 / 3.
    static final int GET_SERVICE_VERSION = 2;
    static final int PRINT_BITMAP = 4;
    static final int BITMAP_WIDTH = 256;
    static final int BITMAP_HEIGHT = 600;
    static final long CONNECTION_TIMEOUT_MS = 5_000;
    static final long SETUP_TIMEOUT_MS = 12_000;
    private static final Pattern UUID = Pattern.compile(
        "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
    );

    private ProbeContract() {}

    static String requestId(String value) {
        if (value == null || !UUID.matcher(value).matches()) {
            throw new IllegalArgumentException("A complete setup-test UUID is required.");
        }
        return value.toLowerCase(Locale.ROOT);
    }

    static String safeMetadata(String value) {
        if (value == null) return null;
        String cleaned = value.replaceAll("[\\p{Cc}\\p{Cf}]", "").trim();
        if (cleaned.isEmpty()) return null;
        return cleaned.substring(0, Math.min(cleaned.length(), 128));
    }
}
