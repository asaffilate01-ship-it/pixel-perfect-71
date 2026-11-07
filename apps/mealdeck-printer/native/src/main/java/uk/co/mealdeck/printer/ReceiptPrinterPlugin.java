package uk.co.mealdeck.printer;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.Set;

/** All receipt content, destinations, sessions and physical sends stay native. */
@CapacitorPlugin(name = "ReceiptPrinter", permissions = {
    @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
})
public final class ReceiptPrinterPlugin extends Plugin {
    private ReceiptRuntime runtime;

    @Override public void load() {
        try { runtime = ReceiptRuntime.get(getContext()); }
        catch (RuntimeException ignored) { runtime = null; }
    }

    @PluginMethod public void getStatus(PluginCall call) {
        if (!ready(call) || !fields(call)) return;
        runtime.refreshForScreen(); resolve(call);
    }

    @PluginMethod public void signIn(PluginCall call) {
        if (!ready(call) || !fields(call, "email", "password")) return;
        run(call, () -> runtime.signIn(call.getString("email"), call.getString("password")));
    }

    @PluginMethod public void verifyMfa(PluginCall call) {
        if (!ready(call) || !fields(call, "factorId", "code")) return;
        run(call, () -> runtime.verifyMfa(call.getString("factorId"), call.getString("code")));
    }

    @PluginMethod public void signOut(PluginCall call) {
        if (!ready(call) || !fields(call)) return;
        run(call, runtime::signOut);
    }

    @PluginMethod public void checkConnection(PluginCall call) {
        if (!ready(call) || !fields(call)) return;
        run(call, runtime::checkConnection);
    }

    @PluginMethod public void start(PluginCall call) {
        if (!ready(call) || !fields(call, "tenantId", "locationId")) return;
        run(call, () -> runtime.start(call.getString("tenantId"), call.getString("locationId")));
    }

    @PluginMethod public void stop(PluginCall call) {
        if (!ready(call) || !fields(call)) return;
        runtime.requestPause(); // immediate gate even when a network command is pending
        run(call, runtime::stop);
    }

    @PluginMethod public void printQueuedJob(PluginCall call) {
        if (!ready(call) || !fields(call, "jobId")) return;
        run(call, () -> runtime.printQueuedJob(call.getString("jobId")));
    }

    @PluginMethod public void confirmPaper(PluginCall call) {
        if (!ready(call) || !fields(call, "jobId", "outcome", "reason")) return;
        run(call, () -> runtime.confirmPaper(call.getString("jobId"), call.getString("outcome"), call.getString("reason")));
    }

    @PluginMethod public void setSound(PluginCall call) {
        if (!ready(call) || !fields(call, "enabled")) return;
        Boolean enabled = call.getBoolean("enabled");
        if (enabled == null) { reject(call, new IllegalArgumentException()); return; }
        run(call, () -> runtime.setSound(enabled));
    }

    @PluginMethod public void requestNotifications(PluginCall call) {
        if (!ready(call) || !fields(call)) return;
        if (getPermissionState("notifications") == PermissionState.GRANTED) resolve(call);
        else requestPermissionForAlias("notifications", call, "notificationsResult");
    }

    @PermissionCallback private void notificationsResult(PluginCall call) { resolve(call); }

    @PluginMethod public void openPrinterScreen(PluginCall call) {
        if (!fields(call)) return;
        try {
            getActivity().startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://mealdeck.co.uk/printer")));
            call.resolve();
        } catch (RuntimeException ignored) { reject(call, new PrinterFailure("network_unavailable")); }
    }

    private void run(PluginCall call, Runnable action) {
        runtime.execute(action).whenComplete((ignored, error) -> {
            if (error != null) reject(call, error); else resolve(call);
        });
    }

    private void resolve(PluginCall call) {
        if (!ready(call)) return;
        try { call.resolve(new JSObject(runtime.status().toString())); }
        catch (Exception error) { reject(call, error); }
    }

    private boolean ready(PluginCall call) {
        if (runtime != null) return true;
        call.reject("Saved receipt history is unavailable. Keep printing paused.", "journal_unavailable"); return false;
    }

    private static boolean fields(PluginCall call, String... expected) {
        if (call.getData().length() == expected.length) {
            boolean all = true; for (String name : expected) if (!call.getData().has(name)) all = false;
            if (all) return true;
        }
        call.reject("This action accepts only its fixed printer fields.", "invalid_request"); return false;
    }

    private static void reject(PluginCall call, Throwable error) {
        while (error.getCause() != null && !(error instanceof PrinterFailure)) error = error.getCause();
        String code = error instanceof PrinterFailure failure ? failure.code : "journal_unavailable";
        Set<String> allowed = Set.of("sign_in_required", "invalid_credentials", "verified_account_required", "mfa_required", "invalid_mfa_code", "printer_access_denied", "printer_unavailable", "network_unavailable", "receipt_held", "journal_unavailable", "operation_in_progress");
        if (!allowed.contains(code)) code = "journal_unavailable";
        call.reject("This receipt action was not confirmed. Check the printer status.", code);
    }
}
