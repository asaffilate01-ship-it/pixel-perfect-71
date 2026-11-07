package uk.co.mealdeck.printer;

import org.junit.Test;

public final class ReceiptLayoutUnitTest {
    @Test public void preservesTheCompleteMeasuredReceipt() throws Exception { ReceiptLayoutTest.run(); }
    @Test public void usesTheTrustedGamesQrRaster() throws Exception { ReceiptGamesQrTest.main(new String[0]); }
}
