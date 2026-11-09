package uk.co.mealdeck.printer;

import static org.junit.Assert.*;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.os.Binder;
import android.os.Parcel;
import android.os.RemoteException;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.google.zxing.BinaryBitmap;
import com.google.zxing.DecodeHintType;
import com.google.zxing.RGBLuminanceSource;
import com.google.zxing.Result;
import com.google.zxing.ResultPoint;
import com.google.zxing.common.HybridBinarizer;
import com.google.zxing.qrcode.QRCodeReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.EnumMap;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Actual Android raster/Parcelable acceptance, using synthetic fixtures and a
 * local recording Binder only. No activity, vendor service or order API runs. */
@RunWith(AndroidJUnit4.class)
public final class ReceiptBitmapInstrumentedTest {
    // Bitmap height includes only the minimal quiet tail; the H10S service
    // performs its own fixed, separately tested four-line paper advance.

    @Test public void representativeReceiptsSurviveOneBitmapSendWithQrAndFooter() throws Exception {
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        for (String name : new String[] { "numbered-reprint", "numbered-cash-meal-named-bags", "long-note-preserved", "legacy-curbside" }) {
            ReceiptModel model = fixture(name);
            String originalFingerprint = model.fingerprint;
            String phone = "numbered-cash-meal-named-bags".equals(name) ? "+447700900123" : null;
            ReceiptLayout layout = ReceiptRenderer.layout(model, phone);
            ReceiptRenderer.RenderedReceipt rendered = ReceiptRenderer.render(target, model, phone);
            try (RecordingBinder receiver = new RecordingBinder(Failure.NONE);
                 PrinterBinderWire.PreparedReceipt prepared = PrinterBinderWire.prepareReceipt(rendered.bitmap)) {
                savePng(target, name, rendered.bitmap);
                assertEquals(name + ": preparation must not send", 0, receiver.calls);
                assertEquals(384, rendered.width);
                assertEquals(layout.totalHeight, rendered.totalHeight);
                assertEquals(layout.lineCount, rendered.lineCount);
                assertFalse(rendered.bitmap.isMutable());

                prepared.send(receiver, () -> true);
                assertWholeRoundTrip(rendered.bitmap, receiver);
                assertEquals(List.of(4, 9), receiver.operations);
                assertEquals(1, receiver.feedCalls);
                assertReceiptRaster(target, receiver.received, layout);
                assertEquals(originalFingerprint, model.fingerprint);

                assertThrows(IllegalStateException.class, () -> prepared.send(receiver, () -> true));
                assertEquals(name + ": a prepared receipt has only one send", 1, receiver.calls);
            } finally {
                rendered.recycle();
                assertTrue(rendered.bitmap.isRecycled());
            }
        }
    }

    @Test public void maximumHeightPreservesBothEndsInOneBoundedParcel() throws Exception {
        Bitmap bitmap = sharedBitmap(384, 16_000, Bitmap.Config.ARGB_8888);
        try (RecordingBinder receiver = new RecordingBinder(Failure.NONE);
             PrinterBinderWire.PreparedReceipt prepared = PrinterBinderWire.prepareReceipt(bitmap)) {
            assertEquals(0, receiver.calls);
            prepared.send(receiver, () -> true);
            assertWholeRoundTrip(bitmap, receiver);
            assertEquals(List.of(4, 9), receiver.operations);
            assertEquals(Color.BLACK, receiver.received.getPixel(0, 0));
            assertEquals(Color.BLACK, receiver.received.getPixel(383, 15_999));
            assertEquals(Color.WHITE, receiver.received.getPixel(192, 8_000));
            assertThrows(IllegalStateException.class, () -> prepared.send(receiver, () -> true));
            assertEquals(1, receiver.calls);
        } finally { bitmap.recycle(); }
    }

    @Test public void allEightPromotionsRetainTheLargeHeaderTheirArtworkAndTheCompleteFooter() throws Exception {
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        for (int sequence = 1; sequence <= 8; sequence++) {
            JSONObject raw = fixture("numbered-cash-meal-named-bags").toJson();
            raw.put("orderNumber", String.format(java.util.Locale.ROOT, "%04d", sequence));
            ReceiptModel model = ReceiptModel.parse(raw);
            String fingerprint = model.fingerprint;
            ReceiptLayout layout = ReceiptRenderer.layout(model, "+447700900123");
            ReceiptRenderer.RenderedReceipt rendered = ReceiptRenderer.render(target, model, "+447700900123");
            try {
                assertEquals(36, element(layout, "order").style.textSize);
                assertEquals(36, element(layout, "collection").style.textSize);
                assertEquals("+447700900123", element(layout, "customer.phone").text);
                assertReceiptRaster(target, rendered.bitmap, layout);
                assertEquals(fingerprint, model.fingerprint);
                savePng(target, "promotion-" + sequence + "-" + layout.promotion.id, rendered.bitmap);
            } finally { rendered.recycle(); }
        }
    }

    @Test public void unsupportedBitmapsAreRejectedBeforeAnySend() {
        assertThrows(IllegalArgumentException.class, () -> PrinterBinderWire.prepareReceipt(null));
        Bitmap mutable = Bitmap.createBitmap(384, 20, Bitmap.Config.ARGB_8888);
        try {
            assertThrows(IllegalArgumentException.class, () -> PrinterBinderWire.prepareReceipt(mutable));
        } finally { mutable.recycle(); }
        assertThrows(IllegalArgumentException.class, () -> PrinterBinderWire.prepareReceipt(mutable));

        assertRejectedSharedBitmap(383, 20, Bitmap.Config.ARGB_8888);
        assertRejectedSharedBitmap(385, 20, Bitmap.Config.ARGB_8888);
        assertRejectedSharedBitmap(384, 16_001, Bitmap.Config.ARGB_8888);
        assertRejectedSharedBitmap(384, 20, Bitmap.Config.RGB_565);
    }

    @Test public void uncertainOrClosedParcelsCannotBeReplayed() throws Exception {
        Bitmap bitmap = sharedBitmap(384, 100, Bitmap.Config.ARGB_8888);
        try {
            for (Failure failure : new Failure[] { Failure.UNAVAILABLE, Failure.REPLY_EXCEPTION }) {
                try (RecordingBinder receiver = new RecordingBinder(failure);
                     PrinterBinderWire.PreparedReceipt prepared = PrinterBinderWire.prepareReceipt(bitmap)) {
                    if (failure == Failure.UNAVAILABLE)
                        assertThrows(RemoteException.class, () -> prepared.send(receiver, () -> true));
                    else
                        assertThrows(SecurityException.class, () -> prepared.send(receiver, () -> true));
                    assertWholeRoundTrip(bitmap, receiver);
                    assertEquals(List.of(4), receiver.operations);
                    assertEquals(0, receiver.feedCalls);
                    assertThrows(IllegalStateException.class, () -> prepared.send(receiver, () -> true));
                    assertEquals("An uncertain return cannot resend pixels", 1, receiver.calls);
                }
            }
            try (RecordingBinder receiver = new RecordingBinder(Failure.NONE)) {
                PrinterBinderWire.PreparedReceipt prepared = PrinterBinderWire.prepareReceipt(bitmap);
                prepared.close();
                prepared.close();
                assertThrows(IllegalStateException.class, () -> prepared.send(receiver, () -> true));
                assertEquals("A discarded preflight must not send", 0, receiver.calls);
            }
        } finally { bitmap.recycle(); }
    }

    @Test public void finalFeedIsPartOfTheOneShotSendAndCannotBeRetried() throws Exception {
        Bitmap bitmap = sharedBitmap(384, 100, Bitmap.Config.ARGB_8888);
        try {
            for (Failure failure : new Failure[] { Failure.FEED_UNAVAILABLE, Failure.FEED_EXCEPTION }) {
                try (RecordingBinder receiver = new RecordingBinder(failure);
                     PrinterBinderWire.PreparedReceipt prepared = PrinterBinderWire.prepareReceipt(bitmap)) {
                    if (failure == Failure.FEED_UNAVAILABLE)
                        assertThrows(RemoteException.class, () -> prepared.send(receiver, () -> true));
                    else
                        assertThrows(SecurityException.class, () -> prepared.send(receiver, () -> true));
                    assertWholeRoundTrip(bitmap, receiver);
                    assertEquals(List.of(4, 9), receiver.operations);
                    assertEquals(1, receiver.feedCalls);
                    assertThrows(IllegalStateException.class, () -> prepared.send(receiver, () -> true));
                    assertEquals("Neither pixels nor uncertain feed may be retried", List.of(4, 9), receiver.operations);
                }
            }
        } finally { bitmap.recycle(); }
    }

    @Test public void pauseOrTimeoutBetweenBitmapAndFeedStopsFurtherOutput() throws Exception {
        Bitmap bitmap = sharedBitmap(384, 100, Bitmap.Config.ARGB_8888);
        try {
            AtomicBoolean continuing = new AtomicBoolean(true);
            try (RecordingBinder receiver = new RecordingBinder(Failure.NONE);
                 PrinterBinderWire.PreparedReceipt prepared = PrinterBinderWire.prepareReceipt(bitmap)) {
                receiver.afterBitmap = () -> continuing.set(false);
                assertThrows(RemoteException.class, () -> prepared.send(receiver, continuing::get));
                assertWholeRoundTrip(bitmap, receiver);
                assertEquals(List.of(4), receiver.operations);
                assertEquals(0, receiver.feedCalls);
                continuing.set(true);
                assertThrows(IllegalStateException.class, () -> prepared.send(receiver, continuing::get));
                assertEquals(List.of(4), receiver.operations);
            }
            try (RecordingBinder receiver = new RecordingBinder(Failure.NONE);
                 PrinterBinderWire.PreparedReceipt prepared = PrinterBinderWire.prepareReceipt(bitmap)) {
                assertThrows(RemoteException.class, () -> prepared.send(receiver, () -> false));
                assertTrue(receiver.operations.isEmpty());
            }
        } finally { bitmap.recycle(); }
    }

    @Test public void twoReceiptsDrainTheirOwnBufferedOutputBeforeTheNextHeader() throws Exception {
        Bitmap first = sharedBitmap(384, 2_600, Bitmap.Config.ARGB_8888);
        Bitmap second = sharedBitmap(384, 400, Bitmap.Config.ARGB_8888);
        try (RecordingBinder receiver = new RecordingBinder(Failure.NONE);
             PrinterBinderWire.PreparedReceipt firstSend = PrinterBinderWire.prepareReceipt(first);
             PrinterBinderWire.PreparedReceipt secondSend = PrinterBinderWire.prepareReceipt(second)) {
            firstSend.send(receiver, () -> true);
            assertFalse("First receipt leaves no unfinished buffer", receiver.pending);
            assertEquals(List.of(2_600), receiver.completedHeights);
            secondSend.send(receiver, () -> true);
            assertFalse("Second receipt leaves no unfinished buffer", receiver.pending);
            assertEquals(List.of(2_600, 400), receiver.completedHeights);
            assertEquals(List.of(4, 9, 4, 9), receiver.operations);
        } finally { first.recycle(); second.recycle(); }
    }

    private static void assertReceiptRaster(Context context, Bitmap bitmap, ReceiptLayout layout) throws Exception {
        assertEquals(384, bitmap.getWidth());
        assertTrue(bitmap.getHeight() <= 16_000);
        assertEquals(layout.contentHeight + ReceiptLayout.FINAL_PAPER_TAIL, bitmap.getHeight());
        int[] pixels = new int[bitmap.getWidth() * bitmap.getHeight()];
        bitmap.getPixels(pixels, 0, bitmap.getWidth(), 0, 0, bitmap.getWidth(), bitmap.getHeight());

        ReceiptLayout.Element logo = element(layout, "logo");
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inScaled = false;
        Bitmap approvedLogo = BitmapFactory.decodeResource(context.getResources(), R.drawable.mealdeck_thermal_logo, options);
        assertNotNull(approvedLogo);
        Bitmap expectedLogo = Bitmap.createBitmap(256, 258, Bitmap.Config.ARGB_8888);
        try {
            Canvas canvas = new Canvas(expectedLogo);
            canvas.drawColor(Color.WHITE);
            canvas.drawBitmap(approvedLogo, 0, 0, null);
            assertEquals(256, logo.width);
            assertEquals(258, logo.height);
            int[] expected = new int[logo.width];
            int[] actual = new int[logo.width];
            for (int y = 0; y < logo.height; y++) {
                expectedLogo.getPixels(expected, 0, logo.width, 0, y, logo.width, 1);
                System.arraycopy(pixels, (logo.y + y) * bitmap.getWidth() + logo.x, actual, 0, logo.width);
                assertArrayEquals("Approved logo row " + y, expected, actual);
            }
            assertHasInk(pixels, bitmap.getWidth(), logo);
        } finally { expectedLogo.recycle(); approvedLogo.recycle(); }

        // Every measured text line must have actual ink within the full image.
        // This also checks the long-note tail, not just the first receipt panel.
        for (ReceiptLayout.Element item : layout.elements) {
            assertTrue(item.role + " exceeds bitmap", item.bottom() <= layout.contentHeight);
            if (item.kind == ReceiptLayout.Kind.TEXT && !item.text.trim().isEmpty())
                assertHasInk(pixels, bitmap.getWidth(), item);
        }
        ReceiptLayout.Element paid = element(layout, "paid");
        ReceiptLayout.Element heading = element(layout, "promotion.heading");
        int gap = heading.y - paid.bottom();
        assertTrue("PAID to promotion stays compact: " + gap, gap >= 0 && gap <= 8);

        ReceiptLayout.Element artwork = element(layout, "promotion.image");
        assertEquals(layout.promotion.width, artwork.width);
        assertEquals(layout.promotion.height, artwork.height);
        assertTrue("Promotion follows the paid total", artwork.y > paid.bottom());
        assertTrue("Promotion stays at the receipt footer", bitmap.getHeight() - artwork.bottom() < 600);
        int resource = context.getResources().getIdentifier(layout.promotion.resourceName, "drawable", context.getPackageName());
        Bitmap fixed = BitmapFactory.decodeResource(context.getResources(), resource, options);
        assertNotNull(fixed);
        try {
            int[] expected = new int[artwork.width];
            int[] actual = new int[artwork.width];
            for (int y = 0; y < artwork.height; y++) {
                fixed.getPixels(expected, 0, artwork.width, 0, y, artwork.width, 1);
                System.arraycopy(pixels, (artwork.y + y) * bitmap.getWidth() + artwork.x, actual, 0, artwork.width);
                assertArrayEquals("Fixed complete promotion image row " + y, expected, actual);
            }
        } finally { fixed.recycle(); }
        if ("qr".equals(layout.promotion.kind)) {
            // Every generated QR has the full four-module (24px) white border.
            for (int y = 0; y < artwork.height; y++) {
                for (int x = 0; x < artwork.width; x++) {
                    if (x < 24 || x >= artwork.width - 24 || y < 24 || y >= artwork.height - 24)
                        assertEquals("QR quiet zone", Color.WHITE, pixels[(artwork.y + y) * bitmap.getWidth() + artwork.x + x]);
                }
            }
            Map<DecodeHintType, Object> hints = new EnumMap<>(DecodeHintType.class);
            hints.put(DecodeHintType.TRY_HARDER, Boolean.TRUE);
            Result decoded = new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(
                new RGBLuminanceSource(bitmap.getWidth(), bitmap.getHeight(), pixels))), hints);
            assertEquals(layout.promotion.targetUrl, decoded.getText());
            assertTrue(decoded.getResultPoints().length >= 3);
            for (ResultPoint point : decoded.getResultPoints()) {
                assertTrue("Decoded QR belongs in the footer", point.getX() >= artwork.x && point.getX() < artwork.x + artwork.width
                    && point.getY() >= artwork.y && point.getY() < artwork.bottom());
            }
        }
        for (String role : new String[] { "footer.trading", "footer.technology", "footer.slogan" }) {
            ReceiptLayout.Element footer = element(layout, role);
            assertTrue("Footer follows the promotion", footer.y >= artwork.bottom());
            assertHasInk(pixels, bitmap.getWidth(), footer);
        }
        for (int index = layout.contentHeight * bitmap.getWidth(); index < pixels.length; index++)
            assertEquals("Minimal final bitmap tail must be white", Color.WHITE, pixels[index]);
    }

    private static ReceiptLayout.Element element(ReceiptLayout layout, String role) {
        for (ReceiptLayout.Element element : layout.elements) if (role.equals(element.role)) return element;
        throw new AssertionError("Missing receipt element: " + role);
    }

    private static void assertHasInk(int[] pixels, int width, ReceiptLayout.Element element) {
        for (int y = element.y; y < element.bottom(); y++)
            for (int x = element.x; x < element.x + element.width; x++)
                if (pixels[y * width + x] != Color.WHITE) return;
        fail("Empty receipt region: " + element.role);
    }

    private static void assertWholeRoundTrip(Bitmap source, RecordingBinder receiver) {
        assertEquals("One complete image is one transaction", 1, receiver.calls);
        assertTrue("Pixel payload must use shared memory", receiver.hasFileDescriptors);
        assertTrue("Binder parcel exceeds limit: " + receiver.dataSize, receiver.dataSize > 0 && receiver.dataSize <= 750_000);
        assertNotNull(receiver.received);
        assertFalse(receiver.received.isMutable());
        assertEquals(Bitmap.Config.ARGB_8888, receiver.received.getConfig());
        assertEquals(source.getWidth(), receiver.received.getWidth());
        assertEquals(source.getHeight(), receiver.received.getHeight());
        assertTrue("Parcelable must preserve every receipt pixel", source.sameAs(receiver.received));
    }

    private static Bitmap sharedBitmap(int width, int height, Bitmap.Config config) {
        Bitmap mutable = Bitmap.createBitmap(width, height, config);
        try {
            mutable.eraseColor(Color.WHITE);
            mutable.setPixel(0, 0, Color.BLACK);
            mutable.setPixel(width - 1, height - 1, Color.BLACK);
            return mutable.asShared();
        } finally { mutable.recycle(); }
    }

    private static void assertRejectedSharedBitmap(int width, int height, Bitmap.Config config) {
        Bitmap bitmap = sharedBitmap(width, height, config);
        try {
            assertThrows(IllegalArgumentException.class, () -> PrinterBinderWire.prepareReceipt(bitmap));
        } finally { bitmap.recycle(); }
    }

    private static ReceiptModel fixture(String name) throws Exception {
        try (InputStream stream = InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("receipt-golden.json")) {
            JSONArray fixtures = new JSONObject(new String(stream.readAllBytes(), StandardCharsets.UTF_8)).getJSONArray("valid");
            for (int index = 0; index < fixtures.length(); index++) {
                JSONObject fixture = fixtures.getJSONObject(index);
                if (name.equals(fixture.getString("name"))) return ReceiptModel.parse(fixture.getJSONObject("input"));
            }
        }
        throw new AssertionError("Missing fixture: " + name);
    }

    private static void savePng(Context target, String name, Bitmap bitmap) throws Exception {
        File directory = new File(target.getCacheDir(), "receipt-render-tests");
        assertTrue(directory.isDirectory() || directory.mkdirs());
        try (FileOutputStream output = new FileOutputStream(new File(directory, name + ".png"))) {
            assertTrue("Receipt PNG could not be saved", bitmap.compress(Bitmap.CompressFormat.PNG, 100, output));
        }
    }

    private enum Failure { NONE, UNAVAILABLE, REPLY_EXCEPTION, FEED_UNAVAILABLE, FEED_EXCEPTION }

    /** Decodes Android's real Bitmap parcel, but never binds a vendor service. */
    private static final class RecordingBinder extends Binder implements AutoCloseable {
        final Failure failure;
        int calls;
        int feedCalls;
        final List<Integer> operations = new ArrayList<>();
        final List<Integer> completedHeights = new ArrayList<>();
        boolean pending;
        Runnable afterBitmap = () -> {};
        int dataSize;
        boolean hasFileDescriptors;
        Bitmap received;

        RecordingBinder(Failure failure) { this.failure = failure; }

        @Override protected boolean onTransact(int code, Parcel data, Parcel reply, int flags) {
            operations.add(code);
            assertEquals("Print is a synchronous transaction", 0, flags);
            data.enforceInterface("recieptservice.com.recieptservice.PrinterInterface");
            assertNotNull(reply);
            if (code == 9) {
                feedCalls++;
                assertTrue("Final feed follows its own bitmap", pending);
                assertEquals("Only the fixed four-line final advance is allowed", 4, data.readInt());
                assertEquals("No arbitrary trailing feed arguments", 0, data.dataAvail());
                if (failure == Failure.FEED_UNAVAILABLE) return false;
                if (failure == Failure.FEED_EXCEPTION) reply.writeException(new SecurityException("Synthetic feed failure"));
                else {
                    completedHeights.add(received.getHeight());
                    pending = false;
                    reply.writeNoException();
                }
                return true;
            }
            calls++;
            assertEquals("Only the reviewed bitmap or fixed feed may be sent", 4, code);
            assertFalse("A new header cannot overtake unfinished receipt output", pending);
            dataSize = data.dataSize();
            hasFileDescriptors = data.hasFileDescriptors();
            assertEquals("Bitmap presence marker", 1, data.readInt());
            if (received != null && !received.isRecycled()) received.recycle();
            received = Bitmap.CREATOR.createFromParcel(data);
            pending = true;
            assertEquals("No trailing bitmap arguments", 0, data.dataAvail());
            if (failure == Failure.UNAVAILABLE) return false;
            if (failure == Failure.REPLY_EXCEPTION) reply.writeException(new SecurityException("Synthetic receiver failure"));
            else { reply.writeNoException(); afterBitmap.run(); }
            return true;
        }

        @Override public void close() {
            if (received != null && !received.isRecycled()) received.recycle();
        }
    }
}
