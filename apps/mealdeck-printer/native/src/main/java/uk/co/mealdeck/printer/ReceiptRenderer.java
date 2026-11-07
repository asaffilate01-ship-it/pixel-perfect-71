package uk.co.mealdeck.printer;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import java.util.EnumMap;
import java.util.Map;

/** Renders the complete validated receipt before one shared-memory Bitmap IPC.
 * Only the bundled approved logo and fixed public games grid are accepted. */
public final class ReceiptRenderer {
    public static final int WIDTH = ReceiptLayout.WIDTH;
    public static final int MAX_HEIGHT = ReceiptLayout.MAX_HEIGHT;
    private ReceiptRenderer() {}

    public static final class RenderedReceipt {
        public final Bitmap bitmap;
        public final int width;
        public final int totalHeight;
        public final int lineCount;
        private RenderedReceipt(Bitmap bitmap, ReceiptLayout layout) {
            this.bitmap = bitmap;
            width = layout.width;
            totalHeight = layout.totalHeight;
            lineCount = layout.lineCount;
        }
        public void recycle() { if (!bitmap.isRecycled()) bitmap.recycle(); }
    }

    private static Map<ReceiptLayout.Style, Paint> paints() {
        Map<ReceiptLayout.Style, Paint> paints = new EnumMap<>(ReceiptLayout.Style.class);
        for (ReceiptLayout.Style style : ReceiptLayout.Style.values()) {
            Paint paint = new Paint();
            paint.setColor(Color.BLACK);
            paint.setTypeface(Typeface.create(Typeface.MONOSPACE, style.bold ? Typeface.BOLD : Typeface.NORMAL));
            paint.setTextSize(style.textSize);
            paint.setAntiAlias(false);
            paint.setDither(false);
            paints.put(style, paint);
        }
        return paints;
    }

    /** The same measured display list is available to Android raster acceptance tests. */
    static ReceiptLayout layout(ReceiptModel model) { return layout(model, paints()); }

    private static ReceiptLayout layout(ReceiptModel model, Map<ReceiptLayout.Style, Paint> paints) {
        return ReceiptLayout.build(model, new ReceiptLayout.TextMeasurer() {
            @Override public float width(String text, ReceiptLayout.Style style) {
                return paints.get(style).measureText(text);
            }
            @Override public int lineHeight(ReceiptLayout.Style style) {
                Paint.FontMetricsInt metrics = paints.get(style).getFontMetricsInt();
                return Math.max(style.minimumLineHeight, metrics.bottom - metrics.top + 2);
            }
        });
    }

    /** Validation, full allocation, drawing and sharing all complete before dispatch. */
    public static RenderedReceipt render(Context context, ReceiptModel model) {
        Bitmap logo = null;
        Bitmap raster = null;
        Bitmap shared = null;
        try {
            Map<ReceiptLayout.Style, Paint> paints = paints();
            ReceiptLayout layout = layout(model, paints);
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inScaled = false;
            options.inPreferredConfig = Bitmap.Config.ARGB_8888;
            logo = BitmapFactory.decodeResource(context.getResources(), R.drawable.mealdeck_thermal_logo, options);
            if (logo == null || logo.getWidth() != ReceiptLayout.LOGO_WIDTH || logo.getHeight() != ReceiptLayout.LOGO_HEIGHT)
                throw new IllegalArgumentException("invalid_fixed_receipt_logo");

            raster = Bitmap.createBitmap(WIDTH, layout.totalHeight, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(raster);
            canvas.drawColor(Color.WHITE);
            Paint ink = new Paint();
            ink.setColor(Color.BLACK);
            ink.setAntiAlias(false);
            ink.setDither(false);
            ink.setFilterBitmap(false);
            for (ReceiptLayout.Element element : layout.elements) {
                switch (element.kind) {
                    case TEXT:
                        Paint text = paints.get(element.style);
                        Paint.FontMetricsInt metrics = text.getFontMetricsInt();
                        float baseline = element.y + (element.height - (metrics.bottom - metrics.top)) / 2f - metrics.top;
                        canvas.drawText(element.text, element.x, baseline, text);
                        break;
                    case LOGO:
                        canvas.drawBitmap(logo, element.x, element.y, ink);
                        break;
                    case QR:
                        for (int row = 0; row < ReceiptGamesQr.MODULE_COUNT; row++) {
                            for (int column = 0; column < ReceiptGamesQr.MODULE_COUNT; column++) {
                                if (!ReceiptGamesQr.darkAt(row, column)) continue;
                                int x = element.x + (column + ReceiptGamesQr.QUIET_ZONE) * ReceiptGamesQr.MODULE_PIXELS;
                                int y = element.y + (row + ReceiptGamesQr.QUIET_ZONE) * ReceiptGamesQr.MODULE_PIXELS;
                                canvas.drawRect(x, y, x + ReceiptGamesQr.MODULE_PIXELS, y + ReceiptGamesQr.MODULE_PIXELS, ink);
                            }
                        }
                        break;
                    case DASHED_RULE:
                        for (int x = element.x; x < element.x + element.width; x += 6)
                            canvas.drawRect(x, element.y, Math.min(x + 3, element.x + element.width), element.bottom(), ink);
                        break;
                    case VERTICAL_RULE:
                        canvas.drawRect(element.x, element.y, element.x + element.width, element.bottom(), ink);
                        break;
                    case BOX:
                        canvas.drawRect(element.x, element.y, element.x + element.width, element.y + 2, ink);
                        canvas.drawRect(element.x, element.bottom() - 2, element.x + element.width, element.bottom(), ink);
                        canvas.drawRect(element.x, element.y, element.x + 2, element.bottom(), ink);
                        canvas.drawRect(element.x + element.width - 2, element.y, element.x + element.width, element.bottom(), ink);
                        break;
                }
            }
            // API 31+ provides immutable shared-memory backing; this app requires
            // API 33. A complete receipt is never divided into independent sends.
            shared = raster.asShared();
            if (shared == null || shared.isMutable() || shared.getConfig() != Bitmap.Config.ARGB_8888
                || shared.getWidth() != WIDTH || shared.getHeight() != layout.totalHeight)
                throw new IllegalArgumentException("receipt_shared_bitmap_unavailable");
            if (shared != raster) raster.recycle();
            raster = null;
            RenderedReceipt result = new RenderedReceipt(shared, layout);
            shared = null;
            return result;
        } catch (IllegalArgumentException failure) {
            throw failure;
        } catch (RuntimeException | OutOfMemoryError failure) {
            throw new IllegalArgumentException("receipt_render_failed");
        } finally {
            if (shared != null && !shared.isRecycled()) shared.recycle();
            if (raster != null && !raster.isRecycled()) raster.recycle();
            if (logo != null && !logo.isRecycled()) logo.recycle();
        }
    }
}
