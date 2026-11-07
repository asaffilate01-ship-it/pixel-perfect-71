package uk.co.mealdeck.printer;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

/** Retains one actual connection and resolves availability only after IPC checks. */
final class PrinterServiceConnection {
    record Report(boolean available, String message, String packageVersion, String descriptor, String serviceVersion) {}
    record Verified(IBinder binder, Report report) {}

    private final Context context;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ScheduledExecutorService deadlines;
    private final ExecutorService bindingWorker = Executors.newSingleThreadExecutor();
    private final ExecutorService versionWorker = Executors.newSingleThreadExecutor();
    private Attempt current;
    private boolean bindingCallRunning;
    private boolean versionCallRunning;

    private final class Attempt implements ServiceConnection {
        final CompletableFuture<Verified> future = new CompletableFuture<>();
        String packageVersion;
        String descriptor;
        String serviceVersion;
        IBinder binder;
        IBinder.DeathRecipient death;
        ScheduledFuture<?> deadline;
        boolean bound;
        boolean verified;

        @Override public void onServiceConnected(ComponentName name, IBinder service) {
            synchronized (PrinterServiceConnection.this) {
                if (current != this) return;
                if (!PrinterContract.SERVICE_PACKAGE.equals(name.getPackageName()) ||
                    !PrinterContract.SERVICE_CLASS.equals(name.getClassName()) || service == null) {
                    fail(this, "The printer service identity did not match. No receipt was sent.");
                    return;
                }
                binder = service;
                death = () -> fail(this, "The printer service stopped. Check the connection again.");
                try { service.linkToDeath(death, 0); }
                catch (Exception error) { fail(this, "The printer service stopped before it could be checked."); return; }
                if (versionCallRunning) { fail(this, "An earlier printer capability check is still running. Wait before checking again."); return; }
                versionCallRunning = true;
                versionWorker.execute(() -> verify(this));
            }
        }

        @Override public void onServiceDisconnected(ComponentName name) { fail(this, "The printer service disconnected. Check again before printing."); }
        @Override public void onBindingDied(ComponentName name) { fail(this, "The printer service binding ended. Check again before printing."); }
        @Override public void onNullBinding(ComponentName name) { fail(this, "The installed printer service did not permit a connection."); }
    }

    PrinterServiceConnection(Context context, ScheduledExecutorService deadlines) {
        this.context = context.getApplicationContext();
        this.deadlines = deadlines;
    }

    synchronized CompletableFuture<Verified> connect() {
        if (current != null) {
            if (!current.verified || (current.binder != null && current.binder.isBinderAlive())) return current.future;
            fail(current, "The printer service connection is no longer available.");
        }
        if (bindingCallRunning || versionCallRunning) {
            return CompletableFuture.completedFuture(unavailable("An earlier printer capability check is still running. Wait before checking again."));
        }
        Attempt attempt = new Attempt();
        current = attempt;
        bindingCallRunning = true;
        attempt.deadline = deadlines.schedule(
            () -> fail(attempt, "The printer connection timed out. No receipt was sent by this check."),
            PrinterContract.CONNECTION_TIMEOUT_MS, TimeUnit.MILLISECONDS);
        bindingWorker.execute(() -> bind(attempt));
        return attempt.future;
    }

    private void bind(Attempt attempt) {
        try {
            synchronized (this) { if (current != attempt) return; }
            Intent intent = new Intent().setComponent(new ComponentName(PrinterContract.SERVICE_PACKAGE, PrinterContract.SERVICE_CLASS));
            // PackageManager and bindService are system Binder calls. Keep them
            // off the UI thread and outside this monitor so the deadline can
            // settle even if the system service is slow or unresponsive.
            PackageManager manager = context.getPackageManager();
            PackageInfo info = manager.getPackageInfo(PrinterContract.SERVICE_PACKAGE, 0);
            ResolveInfo resolved = manager.resolveService(intent, 0);
            synchronized (this) {
                if (current != attempt) return;
                attempt.packageVersion = PrinterContract.safeMetadata(info.versionName);
                if (attempt.packageVersion == null) attempt.packageVersion = Integer.toString(info.versionCode);
            }
            if (resolved == null || resolved.serviceInfo == null || !resolved.serviceInfo.exported || !resolved.serviceInfo.enabled) {
                fail(attempt, "The expected printer service is unavailable to this app. No receipt was sent.");
                return;
            }
            String permission = resolved.serviceInfo.permission;
            if (permission != null && context.checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED) {
                fail(attempt, "The printer service requires a permission this app does not have. No receipt was sent.");
                return;
            }
            synchronized (this) { if (current != attempt) return; }
            // No undocumented startService or elevated privilege request.
            boolean bound = context.bindService(intent, attempt, Context.BIND_AUTO_CREATE);
            synchronized (this) {
                attempt.bound = bound;
                if (current != attempt) {
                    // A deadline can win while bindService is returning. Release
                    // THAT exact connection even if earlier cleanup ran first.
                    main.post(() -> release(attempt));
                    return;
                }
            }
            if (!bound) fail(attempt, "The installed printer service refused the connection. No receipt was sent.");
        } catch (PackageManager.NameNotFoundException error) {
            fail(attempt, "The expected printer service package was not found on this device.");
        } catch (Exception error) {
            fail(attempt, "The printer service could not be accessed. No receipt was sent.");
        } finally {
            synchronized (this) { bindingCallRunning = false; }
        }
    }

    private void verify(Attempt attempt) {
        try {
            String descriptor = attempt.binder.getInterfaceDescriptor();
            synchronized (this) {
                attempt.descriptor = PrinterContract.safeMetadata(descriptor);
                if (current != attempt) return;
                if (!PrinterContract.DESCRIPTOR.equals(descriptor)) {
                    fail(attempt, "The printer service contract did not match the reviewed interface. No receipt was sent.");
                    return;
                }
            }
            String version = PrinterBinderWire.serviceVersion(attempt.binder);
            synchronized (this) {
                if (current != attempt) return;
                if (version == null || !attempt.binder.isBinderAlive()) {
                    fail(attempt, "The printer service did not report a usable version. No receipt was sent.");
                    return;
                }
                attempt.serviceVersion = version;
                attempt.verified = true;
                if (attempt.deadline != null) attempt.deadline.cancel(false);
                attempt.future.complete(new Verified(attempt.binder, report(attempt, true,
                    "The printer service is connected. Ready for receipt dispatch; paper confirmation remains separate.")));
            }
        } catch (Exception error) {
            fail(attempt, "The printer service capability check failed. No receipt was sent.");
        } finally {
            synchronized (this) { versionCallRunning = false; }
        }
    }

    synchronized boolean isCurrent(Verified verified) {
        return current != null && current.verified && current.binder == verified.binder() && verified.binder().isBinderAlive();
    }

    synchronized void disconnect() {
        if (current != null) fail(current, "The receipt service stopped. Check the printer connection again.");
    }

    private synchronized void fail(Attempt attempt, String message) {
        if (current != attempt) return;
        current = null;
        if (attempt.deadline != null) attempt.deadline.cancel(false);
        attempt.future.complete(new Verified(null, report(attempt, false, message)));
        main.post(() -> release(attempt));
    }

    private void release(Attempt attempt) {
        IBinder binder;
        IBinder.DeathRecipient death;
        boolean bound;
        synchronized (this) {
            binder = attempt.binder;
            death = attempt.death;
            attempt.death = null;
            bound = attempt.bound;
            attempt.bound = false;
        }
        if (binder != null && death != null) {
            try { binder.unlinkToDeath(death, 0); } catch (Exception ignored) { }
        }
        if (bound) {
            try { context.unbindService(attempt); } catch (IllegalArgumentException ignored) { }
        }
    }

    private static Report report(Attempt attempt, boolean available, String message) {
        return new Report(available, message, attempt.packageVersion, attempt.descriptor, attempt.serviceVersion);
    }

    private static Verified unavailable(String message) { return new Verified(null, new Report(false, message, null, null, null)); }
}
