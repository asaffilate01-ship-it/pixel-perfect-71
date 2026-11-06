package uk.co.mealdeck.printerprobe;

import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;

/** Local hardware diagnosis only: no receipt queue, network or payment API. */
@CapacitorPlugin(name = "MealDeckPrinterProbe")
public final class MealDeckPrinterProbePlugin extends Plugin {
    private ProbeRuntime runtime;

    @Override public void load() {
        try { runtime = ProbeRuntime.attach(getContext()); }
        catch (RuntimeException ignored) { runtime = null; }
    }

    @PluginMethod public void probe(PluginCall call) {
        if (!ready(call) || !fields(call, 0)) return;
        runtime.connection.connect().whenComplete((verified, error) -> {
            if (error != null || verified == null) {
                call.resolve(probeResult(new PrinterServiceConnection.Report(false,
                    "The printer capability check could not finish. No test was sent.", null, null, null)));
            } else call.resolve(probeResult(verified.report()));
        });
    }

    @PluginMethod public void getTestState(PluginCall call) {
        if (!ready(call) || !fields(call, 0)) return;
        try { call.resolve(testResult(runtime.tests.current())); }
        catch (RuntimeException error) { reject(call, error); }
    }

    @PluginMethod public void printSetup(PluginCall call) {
        if (!ready(call) || !fields(call, 1)) return;
        if (!call.getData().has("requestId")) {
            call.reject("A complete setup-test UUID is required.", "invalid_request");
            return;
        }
        try {
            runtime.tests.print(call.getString("requestId")).whenComplete((test, error) -> {
                if (error != null) reject(call, error);
                else call.resolve(testResult(test));
            });
        } catch (RuntimeException error) { reject(call, error); }
    }

    @PluginMethod public void confirmPaper(PluginCall call) {
        if (!ready(call) || !fields(call, 2)) return;
        if (!call.getData().has("requestId") || !call.getData().has("outcome")) {
            call.reject("A setup-test UUID and an inspected paper outcome are required.", "invalid_request");
            return;
        }
        try { call.resolve(testResult(runtime.tests.confirm(call.getString("requestId"), call.getString("outcome")))); }
        catch (RuntimeException error) { reject(call, error); }
    }

    @Override protected void handleOnDestroy() {
        if (runtime != null) {
            ProbeRuntime.detach(runtime);
            runtime = null;
        }
    }

    private boolean ready(PluginCall call) {
        if (runtime != null) return true;
        call.reject("The saved setup journal is unavailable. Do not clear app data or start another test.", "journal_unavailable");
        return false;
    }

    private static boolean fields(PluginCall call, int count) {
        if (call.getData().length() == count) return true;
        call.reject("This diagnostic method accepts only its fixed setup-test fields.", "invalid_request");
        return false;
    }

    private static JSObject probeResult(PrinterServiceConnection.Report report) {
        JSObject result = new JSObject();
        result.put("available", report.available());
        result.put("state", report.available() ? "available" : "unavailable");
        result.put("message", report.message());
        JSObject device = new JSObject();
        device.put("model", safeDevice(Build.MODEL));
        device.put("androidVersion", safeDevice(Build.VERSION.RELEASE));
        device.put("apiLevel", Build.VERSION.SDK_INT);
        device.put("build", safeDevice(Build.DISPLAY));
        result.put("device", device);
        JSObject service = new JSObject();
        service.put("packageName", ProbeContract.SERVICE_PACKAGE);
        service.put("componentName", ProbeContract.SERVICE_CLASS);
        service.put("packageVersion", nullable(report.packageVersion()));
        service.put("descriptor", nullable(report.descriptor()));
        service.put("serviceVersion", nullable(report.serviceVersion()));
        result.put("service", service);
        return result;
    }

    private static String safeDevice(String value) {
        String safe = ProbeContract.safeMetadata(value);
        return safe == null ? "Unknown" : safe;
    }

    private static Object nullable(String value) { return value == null ? JSONObject.NULL : value; }

    private static JSObject testResult(SetupJournal.Test test) {
        JSObject result = new JSObject();
        if (test == null) { result.put("test", JSONObject.NULL); return result; }
        JSObject saved = new JSObject();
        saved.put("requestId", test.requestId());
        saved.put("status", test.status());
        saved.put("createdAt", test.createdAt());
        saved.put("updatedAt", test.updatedAt());
        saved.put("message", test.message());
        result.put("test", saved);
        return result;
    }

    private static void reject(PluginCall call, Throwable error) {
        String message = error.getMessage();
        // Only our fixed messages are returned; SQLite/Binder exception text is
        // deliberately not copied to the WebView or logged.
        String[] allowed = {
            "A complete setup-test UUID is required.",
            "Inspect the paper and choose printed or not printed.",
            "The printer is still finishing an earlier test. Check its status first.",
            "The printer call is still running. Wait for it to settle before confirming paper.",
            "Resolve the previous setup test after inspecting its paper before starting another.",
            "That setup test was not found in the saved journal.",
            "This test is still sending or already has a recorded paper result."
        };
        for (String fixed : allowed) {
            if (fixed.equals(message)) { call.reject(fixed, "setup_test_blocked"); return; }
        }
        call.reject("The saved test state could not be verified. Keep the same test ID and inspect the printer before doing anything else.", "journal_unavailable");
    }
}
