package uk.co.mealdeck.printer;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** Renders one validated receipt into bounded Binder-safe monochrome strips.
 * There is no remote image, caller-provided raster or printer opcode input. */
public final class ReceiptRenderer {
    public static final int WIDTH = 384;
    public static final int MAX_STRIP_HEIGHT = 384;
    public static final int MAX_HEIGHT = 16_000;
    private static final int LINE_HEIGHT = 24;
    private static final int TOP = 8;
    private static final int LOGO_HEIGHT = 258;
    private static final int TEXT_TOP = TOP + LOGO_HEIGHT + 12;
    private static final int FINAL_BLANK_LINES = 3;

    private ReceiptRenderer() {}

    public static final class RenderedReceipt {
        public final List<Bitmap> strips;
        public final int width;
        public final int totalHeight;
        public final int lineCount;

        private RenderedReceipt(List<Bitmap> strips, int height, int lineCount) {
            this.strips = Collections.unmodifiableList(new ArrayList<>(strips));
            this.width = WIDTH;
            this.totalHeight = height;
            this.lineCount = lineCount;
        }
        public void recycle() {
            for (Bitmap strip : strips) if (!strip.isRecycled()) strip.recycle();
        }
    }

    /** Finishes all validation and allocation before returning any strip to dispatch. */
    public static RenderedReceipt render(Context context, ReceiptModel model) {
        List<String> lines = ReceiptText.layout(model);
        int height = TEXT_TOP + (lines.size() + FINAL_BLANK_LINES) * LINE_HEIGHT;
        if (height > MAX_HEIGHT) throw new IllegalArgumentException("receipt_too_long");
        Paint text = new Paint();
        text.setColor(Color.BLACK);
        text.setTypeface(Typeface.MONOSPACE);
        text.setTextSize(18f);
        text.setAntiAlias(false);
        text.setDither(false);
        // Typeface metrics are verified before dispatch rather than clipping a long line.
        for (String line : lines) if (text.measureText(line) > WIDTH - 24) throw new IllegalArgumentException("receipt_layout_unavailable");
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inScaled = false;
        options.inPreferredConfig = Bitmap.Config.ARGB_8888;
        Bitmap logo = BitmapFactory.decodeResource(context.getResources(), R.drawable.mealdeck_thermal_logo, options);
        if (logo == null || logo.getWidth() != 256 || logo.getHeight() != LOGO_HEIGHT) {
            if (logo != null) logo.recycle();
            throw new IllegalArgumentException("invalid_fixed_receipt_logo");
        }
        List<Bitmap> strips = new ArrayList<>();
        try {
            Paint bitmapPaint = new Paint();
            bitmapPaint.setFilterBitmap(false);
            bitmapPaint.setDither(false);
            for (int y = 0; y < height; y += MAX_STRIP_HEIGHT) {
                int stripHeight = Math.min(MAX_STRIP_HEIGHT, height - y);
                Bitmap strip = Bitmap.createBitmap(WIDTH, stripHeight, Bitmap.Config.ARGB_8888);
                strips.add(strip);
                Canvas canvas = new Canvas(strip);
                canvas.drawColor(Color.WHITE);
                canvas.translate(0, -y);
                if (y < TOP + LOGO_HEIGHT) canvas.drawBitmap(logo, (WIDTH - logo.getWidth()) / 2f, TOP, bitmapPaint);
                int first = Math.max(0, (y - TEXT_TOP) / LINE_HEIGHT - 1);
                int last = Math.min(lines.size(), (y + stripHeight - TEXT_TOP) / LINE_HEIGHT + 2);
                for (int n = first; n < last; n++) canvas.drawText(lines.get(n), 12, TEXT_TOP + n * LINE_HEIGHT + 18, text);
                if (strip.getByteCount() > 589_824) throw new IllegalArgumentException("receipt_strip_too_large");
            }
            return new RenderedReceipt(strips, height, lines.size());
        } catch (RuntimeException | OutOfMemoryError failure) {
            for (Bitmap strip : strips) if (!strip.isRecycled()) strip.recycle();
            throw new IllegalArgumentException("receipt_render_failed");
        } finally { logo.recycle(); }
    }
}
