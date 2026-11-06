package uk.co.mealdeck.printerprobe;

import android.content.Context;
import android.graphics.Bitmap;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/** A process singleton prevents Activity recreation from forgetting an in-flight send. */
final class ProbeRuntime {
    private static ProbeRuntime instance;
    final PrinterServiceConnection connection;
    final SetupTestCoordinator tests;
    private int clients;

    static synchronized ProbeRuntime attach(Context context) {
        if (instance == null) instance = new ProbeRuntime(context.getApplicationContext());
        instance.clients++;
        return instance;
    }

    static synchronized void detach(ProbeRuntime runtime) {
        if (instance != runtime || runtime.clients == 0) return;
        runtime.clients--;
        if (runtime.clients == 0) {
            runtime.tests.interrupt();
            runtime.connection.disconnect();
        }
    }

    private ProbeRuntime(Context context) {
        ScheduledExecutorService deadlines = Executors.newSingleThreadScheduledExecutor();
        ExecutorService sender = Executors.newSingleThreadExecutor();
        connection = new PrinterServiceConnection(context, deadlines);
        SqliteSetupJournal journal = new SqliteSetupJournal(context);
        tests = new SetupTestCoordinator(journal, permit -> {
            Bitmap sample = SetupSample.render(context);
            try {
                PrinterServiceConnection.Verified service = connection.connect().get(
                    ProbeContract.CONNECTION_TIMEOUT_MS + 1_000, TimeUnit.MILLISECONDS);
                if (!service.report().available() || !connection.isCurrent(service)) {
                    throw new IllegalStateException("The printer service was not verified. No sample was dispatched.");
                }
                if (!permit.begin()) return;
                if (!connection.isCurrent(service)) throw new IllegalStateException("The printer connection ended before dispatch.");
                PrinterBinderWire.printSetupBitmap(service.binder(), sample);
            } finally {
                sample.recycle();
            }
        }, sender, (work, delay) -> {
            var future = deadlines.schedule(work, delay, TimeUnit.MILLISECONDS);
            return () -> future.cancel(false);
        }, ProbeRuntime::now);
    }

    private static String now() {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date());
    }
}
