package uk.co.mealdeck.printerprobe;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;

/** Only native-owned fixed content can reach the one bitmap print operation. */
final class SetupSample {
    private SetupSample() {}

    static Bitmap render(Context context) {
        Bitmap bitmap = Bitmap.createBitmap(ProbeContract.BITMAP_WIDTH, ProbeContract.BITMAP_HEIGHT, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        canvas.drawColor(Color.WHITE);
        Drawable logo = context.getDrawable(R.drawable.mealdeck_thermal_logo);
        if (logo == null || logo.getIntrinsicWidth() <= 0 || logo.getIntrinsicHeight() <= 0) {
            bitmap.recycle();
            throw new IllegalStateException("The approved setup logo is unavailable.");
        }
        float scale = Math.min(224f / logo.getIntrinsicWidth(), 118f / logo.getIntrinsicHeight());
        int width = Math.max(1, Math.round(logo.getIntrinsicWidth() * scale));
        int height = Math.max(1, Math.round(logo.getIntrinsicHeight() * scale));
        int left = (ProbeContract.BITMAP_WIDTH - width) / 2;
        logo.setBounds(new Rect(left, 18, left + width, 18 + height));
        logo.draw(canvas);

        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(Color.BLACK);
        paint.setTextAlign(Paint.Align.CENTER);
        paint.setTypeface(Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD));
        fitText(canvas, paint, "MEALDECK PRINTER SETUP", 176, 18);
        paint.setTypeface(Typeface.create(Typeface.SANS_SERIF, Typeface.NORMAL));
        fitText(canvas, paint, "No customer order", 216, 21);
        fitText(canvas, paint, "No payment taken", 248, 21);
        paint.setStrokeWidth(2);
        canvas.drawLine(16, 274, 240, 274, paint);
        fitText(canvas, paint, "Hardware setup sample", 312, 18);
        fitText(canvas, paint, "Inspect this paper before", 344, 18);
        fitText(canvas, paint, "confirming the result.", 372, 18);
        fitText(canvas, paint, "This is not an order receipt.", 420, 16);
        // Blank raster below the sample provides feed in the SAME Binder call.
        // There is no separate feed/cut command and no arbitrary caller content.
        return bitmap;
    }

    private static void fitText(Canvas canvas, Paint paint, String text, float baseline, float initialSize) {
        paint.setTextSize(initialSize);
        while (paint.measureText(text) > 232 && paint.getTextSize() > 10) {
            paint.setTextSize(paint.getTextSize() - 0.5f);
        }
        canvas.drawText(text, ProbeContract.BITMAP_WIDTH / 2f, baseline, paint);
    }
}
