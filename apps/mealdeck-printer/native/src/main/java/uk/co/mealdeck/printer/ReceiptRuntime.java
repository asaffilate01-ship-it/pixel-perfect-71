package uk.co.mealdeck.printer;

import android.Manifest;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import org.json.JSONArray;
import org.json.JSONObject;

/** One process-wide command worker, one physical sender, and no startup resend. */
final class ReceiptRuntime {
    private static ReceiptRuntime instance;
    static synchronized ReceiptRuntime get(Context context) {
        if (instance == null) instance = new ReceiptRuntime(context.getApplicationContext());
        return instance;
    }

    private static final Set<String> STATES = Set.of("queued", "claimed", "sending", "sent_unconfirmed", "printed", "held", "failed");
    private static final String INSPECT = "A receipt needs inspection. Automatic printing is paused; check the paper before continuing.";
    private final Context context;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ScheduledExecutorService commands = Executors.newSingleThreadScheduledExecutor();
    private final ScheduledExecutorService deadlines = Executors.newSingleThreadScheduledExecutor();
    private final PrinterApi api;
    private final ReceiptJournal journal;
    private final PrinterServiceConnection connection;
    private final ReceiptDispatch dispatch;
    private final SharedPreferences preferences;
    private final AtomicBoolean refreshQueued = new AtomicBoolean();
    private final AtomicInteger queuedActions = new AtomicInteger();
    private final AtomicLong pauseEpoch = new AtomicLong();
    private volatile boolean enabled;
    private volatile boolean journalHealthy = true;
    private volatile boolean soundEnabled;
    private volatile String message = "Automatic printing is paused. Sign in and choose a kitchen to enable it.";
    private volatile ReceiptForegroundService foreground;
    private volatile CompletableFuture<Void> foregroundReady;
    private volatile PrinterServiceConnection.Verified verified;
    private volatile JSONObject snapshot = PrinterApi.json();
    private volatile long lastRefreshClock;
    private List<Scope> scopes = List.of();
    private Scope selected;
    private List<Job> jobs = List.of();
    private String lastPollAt;
    private long boardTime;
    private long lastUserCheck;

    private record Scope(String tenantId, String locationId, String tenantName, String locationName) {
        JSONObject json() { return PrinterApi.json("tenantId", tenantId, "locationId", locationId, "tenantName", tenantName, "locationName", locationName); }
    }

    private static final class Job {
        final String jobId, status, createdAt;
        final ReceiptModel receipt;
        Job(JSONObject value) {
            jobId = PrinterContract.requestId(value.optString("jobId", null));
            String orderId = PrinterContract.requestId(value.optString("orderId", null));
            status = value.optString("status", "");
            createdAt = stamp(value.optString("createdAt", null));
            stamp(value.optString("updatedAt", null));
            if (!STATES.contains(status)) throw new IllegalArgumentException();
            receipt = ReceiptModel.parse(value.optJSONObject("receipt"));
            Object copy = value.opt("copyNumber");
            if (!(copy instanceof Number) || ((Number) copy).doubleValue() != receipt.copyNumber || !orderId.equals(receipt.orderId)) throw new IllegalArgumentException();
        }
    }

    private ReceiptRuntime(Context context) {
        this.context = context;
        preferences = context.getSharedPreferences("receipt-operator-v1", Context.MODE_PRIVATE);
        soundEnabled = preferences.getBoolean("sound", true);
        journal = new ReceiptJournal(context);
        journal.recover();
        api = new PrinterApi(new SessionVault(context));
        connection = new PrinterServiceConnection(context, deadlines);
        dispatch = new ReceiptDispatch(new ReceiptDispatch.Journal() {
            @Override public void begin(String id) {
                ReceiptJournal.Attempt attempt = journal.find(id);
                if (attempt == null) throw new PrinterFailure("journal_unavailable");
                journal.begin(id, attempt.fingerprint);
            }
            @Override public void finish(String id, String outcome) { journal.finish(id, outcome); }
        }, Executors.newSingleThreadExecutor(), (work, delay) -> {
            var future = deadlines.schedule(work, delay, TimeUnit.MILLISECONDS);
            return () -> future.cancel(false);
        });
        rebuildSnapshot();
        commands.scheduleWithFixedDelay(this::automaticTick, 3, 3, TimeUnit.SECONDS);
    }

    CompletableFuture<Void> execute(Runnable work) {
        CompletableFuture<Void> result = new CompletableFuture<>();
        long submittedEpoch = pauseEpoch.get();
        if (queuedActions.incrementAndGet() != 1) {
            queuedActions.decrementAndGet(); result.completeExceptionally(new PrinterFailure("operation_in_progress")); return result;
        }
        commands.execute(() -> {
            try {
                if (pauseEpoch.get() != submittedEpoch) throw new PrinterFailure("operation_in_progress");
                work.run(); rebuildSnapshot(); result.complete(null);
            }
            catch (Throwable error) {
                try { handleFailure(error); rebuildSnapshot(); }
                finally { result.completeExceptionally(error); }
            } finally { queuedActions.decrementAndGet(); }
        });
        return result;
    }

    JSONObject status() {
        try {
            JSONObject result = new JSONObject(snapshot.toString());
            result.put("serviceMessage", message);
            result.put("serviceRunning", enabled && foreground != null && api.signedIn() && !api.needsMfa() && !result.isNull("selectedScope"));
            result.put("notificationsAllowed", notificationsAllowed());
            result.put("soundEnabled", soundEnabled);
            return result;
        } catch (Exception ignored) { throw new PrinterFailure("journal_unavailable"); }
    }

    void refreshForScreen() {
        if (System.nanoTime() - lastRefreshClock < 3_000_000_000L || !refreshQueued.compareAndSet(false, true)) return;
        commands.execute(() -> {
            try {
                if (api.signedIn()) refreshBoard(false);
                rebuildSnapshot();
            } catch (Throwable error) { handleFailure(error); rebuildSnapshot(); }
            finally { lastRefreshClock = System.nanoTime(); refreshQueued.set(false); }
        });
    }

    void signIn(String email, String password) {
        requireIdle(); stop();
        scopes = List.of(); selected = null; jobs = List.of(); lastPollAt = null;
        api.signIn(email, password);
        if (api.needsMfa()) { message = "Enter your authenticator code to unlock the receipt queue."; return; }
        refreshBoard(true); message = "Signed in. Check the built-in printer, then enable automatic receipts.";
    }

    void verifyMfa(String factorId, String code) {
        requireIdle(); api.verifyMfa(factorId, code); refreshBoard(true);
        message = "Sign-in verified. Check the printer and enable automatic receipts.";
    }

    void signOut() {
        requireIdle(); stop(); api.signOut(); scopes = List.of(); selected = null; jobs = List.of(); lastPollAt = null;
        message = "Signed out. Automatic printing is paused; saved receipt history is retained.";
    }

    void checkConnection() {
        try {
            verified = connection.connect().get(PrinterContract.CONNECTION_TIMEOUT_MS + 1000, TimeUnit.MILLISECONDS);
            if (!verified.report().available() || !connection.isCurrent(verified)) throw new PrinterFailure("printer_unavailable");
        } catch (PrinterFailure failure) { throw failure; }
        catch (Exception ignored) { throw new PrinterFailure("printer_unavailable"); }
    }

    void start(String tenant, String location) {
        requireIdle(); requireJournal();
        long permittedEpoch = pauseEpoch.get();
        tenant = PrinterContract.requestId(tenant); location = PrinterContract.requestId(location);
        api.checkUser(); lastUserCheck = System.nanoTime(); readAccess();
        selected = findScope(tenant, location);
        if (selected == null) throw new PrinterFailure("printer_access_denied");
        readBoard(); reconcile();
        if (journal.hasHeld() || jobs.stream().anyMatch(j -> "held".equals(j.status))) throw new PrinterFailure("receipt_held");
        checkConnection();
        journal.ensureBaseline(tenant, location, boardTime);
        preferences.edit().putString("tenant", tenant).putString("location", location).apply();
        ensureForeground();
        if (pauseEpoch.get() != permittedEpoch) throw new PrinterFailure("operation_in_progress");
        enabled = true;
        message = "Automatic receipts are enabled. New accepted orders will print once.";
        updateNotice();
        // A fixed-delay worker reads a fresh board before choosing any job.
    }

    void requestPause() {
        pauseEpoch.incrementAndGet(); enabled = false;
        deadlines.execute(dispatch::interrupt);
    }

    void stop() {
        pauseEpoch.incrementAndGet(); enabled = false; dispatch.interrupt();
        message = dispatch.active() ? "Pausing: a printer call is still settling. Inspect its paper before continuing." : "Automatic printing is paused. New queued receipts are retained for resume.";
        if (!dispatch.active()) {
            context.stopService(new Intent(context, ReceiptForegroundService.class)); connection.disconnect(); verified = null;
        }
        updateNotice();
    }

    void setSound(boolean enabled) {
        if (!preferences.edit().putBoolean("sound", enabled).commit()) throw new PrinterFailure("journal_unavailable");
        soundEnabled = enabled;
    }

    void printQueuedJob(String jobId) {
        requireIdle(); requireJournal();
        String id = PrinterContract.requestId(jobId);
        refreshBoard(true);
        if (selected == null) throw new PrinterFailure("printer_access_denied");
        if (journal.hasHeld() || jobs.stream().anyMatch(j -> "held".equals(j.status))) throw new PrinterFailure("receipt_held");
        Job job = findJob(id);
        if (job == null || !"queued".equals(job.status) || journal.find(id) != null) throw new PrinterFailure("receipt_held");
        checkConnection(); ensureForeground(); send(job, false);
    }

    void confirmPaper(String jobId, String outcome, String reason) {
        requireIdle(); requireJournal();
        String id = PrinterContract.requestId(jobId);
        if (!Set.of("printed", "not_printed").contains(outcome) || reason == null || reason.trim().length() < 5 || reason.trim().length() > 300) throw new PrinterFailure("receipt_held");
        refreshBoard(true);
        if (selected == null) throw new PrinterFailure("printer_access_denied");
        Job job = findJob(id); ReceiptJournal.Attempt local = journal.find(id);
        if (job == null && (local == null || !local.tenantId.equals(selected.tenantId) || !local.locationId.equals(selected.locationId))) throw new PrinterFailure("receipt_held");
        String state = local == null ? job.status : local.state;
        if (!Set.of("sending", "sent_unconfirmed", "held").contains(state)) throw new PrinterFailure("receipt_held");
        JSONObject result = api.rpc("mealdeck_printer_confirm_paper", args("p_job", id, "p_outcome", outcome, "p_reason", reason.trim()));
        String expected = "printed".equals(outcome) ? "printed" : "failed";
        if (!Boolean.TRUE.equals(result.opt("ok")) || !expected.equals(result.optString("status"))) throw new PrinterFailure("receipt_held");
        if (local != null) journal.confirm(id, outcome);
        readBoard();
        message = "Paper outcome recorded. Enable automatic receipts when the printer is ready.";
    }

    void foregroundStarted(ReceiptForegroundService service) {
        foreground = service;
        CompletableFuture<Void> ready = foregroundReady; if (ready != null) ready.complete(null);
    }

    void foregroundStopped(ReceiptForegroundService service) {
        if (foreground != service) return;
        foreground = null;
        boolean wasEnabled = enabled; enabled = false;
        pauseEpoch.incrementAndGet();
        deadlines.execute(dispatch::interrupt);
        if (wasEnabled) message = "The receipt service stopped. Inspect any in-flight receipt, then enable it again.";
    }

    void pauseFromService() { requestPause(); commands.execute(() -> { stop(); rebuildSnapshot(); }); }

    private void ensureForeground() {
        if (foreground != null) return;
        CompletableFuture<Void> ready = new CompletableFuture<>(); foregroundReady = ready;
        main.post(() -> {
            try { context.startForegroundService(new Intent(context, ReceiptForegroundService.class)); }
            catch (RuntimeException ignored) { ready.completeExceptionally(new PrinterFailure("printer_unavailable")); }
        });
        try { ready.get(6000, TimeUnit.MILLISECONDS); }
        catch (Exception ignored) { throw new PrinterFailure("printer_unavailable"); }
        finally { foregroundReady = null; }
    }

    private void automaticTick() {
        if (!enabled) {
            // A deadline may settle its future before Binder finally returns.
            // Release the foreground notice only after that real slot is idle.
            if (foreground != null && !dispatch.active() && queuedActions.get() == 0)
                context.stopService(new Intent(context, ReceiptForegroundService.class));
            return;
        }
        try {
            if (dispatch.active()) { if (verified == null || !connection.isCurrent(verified)) { enabled = false; dispatch.interrupt(); message = INSPECT; } return; }
            requireJournal(); refreshBoard(false);
            if (!enabled || selected == null) return;
            if (journal.hasHeld() || jobs.stream().anyMatch(j -> "held".equals(j.status))) throw new PrinterFailure("receipt_held");
            long baseline = journal.baseline(selected.tenantId, selected.locationId);
            if (baseline <= 0) throw new PrinterFailure("journal_unavailable");
            if (verified == null || !connection.isCurrent(verified)) throw new PrinterFailure("printer_unavailable");
            for (Job job : jobs) {
                if ("queued".equals(job.status) && Instant.parse(job.createdAt).toEpochMilli() >= baseline && journal.find(job.jobId) == null) {
                    send(job, true); break;
                }
            }
            if (!dispatch.active()) message = "Automatic receipts are enabled. Waiting for the next accepted order.";
        } catch (Throwable error) { handleFailure(error); }
        finally { rebuildSnapshot(); updateNotice(); }
    }

    private void refreshBoard(boolean forceUser) {
        if (forceUser || System.nanoTime() - lastUserCheck > 60_000_000_000L) { api.checkUser(); lastUserCheck = System.nanoTime(); }
        if (api.needsMfa()) throw new PrinterFailure("mfa_required");
        readAccess();
        if (selected == null) return;
        readBoard(); reconcile();
        lastRefreshClock = System.nanoTime();
    }

    private void readAccess() {
        JSONObject value = api.rpc("mealdeck_printer_my_access", new JSONObject());
        JSONArray source = value.optJSONArray("scopes");
        if (!Integer.valueOf(1).equals(value.opt("schemaVersion")) || source == null || source.length() > 100) throw new PrinterFailure("printer_access_denied");
        List<Scope> next = new ArrayList<>(); Set<String> identities = new HashSet<>();
        for (int i = 0; i < source.length(); i++) {
            JSONObject s = source.optJSONObject(i); if (s == null) throw new PrinterFailure("printer_access_denied");
            Scope scope = new Scope(PrinterContract.requestId(s.optString("tenantId", null)), PrinterContract.requestId(s.optString("locationId", null)), boundedText(s.opt("tenantName"), 140), boundedText(s.opt("locationName"), 140));
            if (!identities.add(scope.tenantId + ":" + scope.locationId)) throw new PrinterFailure("printer_access_denied");
            next.add(scope);
        }
        scopes = List.copyOf(next);
        if (selected != null) {
            selected = findScope(selected.tenantId, selected.locationId);
            if (selected == null) { enabled = false; jobs = List.of(); lastPollAt = null; throw new PrinterFailure("printer_access_denied"); }
        } else {
            selected = findScope(preferences.getString("tenant", ""), preferences.getString("location", ""));
            if (selected == null && scopes.size() == 1) selected = scopes.get(0);
        }
        if (scopes.isEmpty()) throw new PrinterFailure("printer_access_denied");
    }

    private void readBoard() {
        JSONObject value = api.rpc("mealdeck_printer_board", args());
        if (!Integer.valueOf(1).equals(value.opt("schemaVersion")) || !selected.tenantId.equals(value.optString("tenantId")) || !selected.locationId.equals(value.optString("locationId"))) throw new PrinterFailure("receipt_held");
        String generated = stamp(value.optString("generatedAt", null));
        JSONArray source = value.optJSONArray("jobs");
        if (source == null || source.length() > 100) throw new PrinterFailure("receipt_held");
        List<Job> next = new ArrayList<>(); Set<String> ids = new HashSet<>();
        for (int i = 0; i < source.length(); i++) {
            JSONObject raw = source.optJSONObject(i); if (raw == null) throw new PrinterFailure("receipt_held");
            Job job = new Job(raw); if (!ids.add(job.jobId)) throw new PrinterFailure("receipt_held"); next.add(job);
        }
        jobs = List.copyOf(next); boardTime = Instant.parse(generated).toEpochMilli(); lastPollAt = generated;
    }

    private void reconcile() {
        if (selected == null || dispatch.active()) return;
        for (ReceiptJournal.Attempt local : journal.list(selected.tenantId, selected.locationId)) {
            Job server = findJob(local.jobId);
            if (server == null) continue;
            if (!local.fingerprint.equals(server.receipt.fingerprint) || !local.orderId.equals(server.receipt.orderId) || local.copyNumber != server.receipt.copyNumber) throw new PrinterFailure("receipt_held");
            if (Set.of("printed", "failed").contains(server.status) && !Set.of("printed", "failed").contains(local.state)) {
                journal.confirm(local.jobId, "printed".equals(server.status) ? "printed" : "not_printed");
            } else if ("held".equals(server.status) && "sent_unconfirmed".equals(local.state)) {
                journal.finish(local.jobId, "held"); journal.markReported(local.jobId, "held");
                enabled = false; message = INSPECT;
            } else if (local.state.equals(server.status) && Set.of("held", "sent_unconfirmed").contains(local.state) && !local.reported) {
                journal.markReported(local.jobId, local.state);
            } else if (!local.reported && local.userId.equals(api.userId()) && Set.of("held", "sent_unconfirmed").contains(local.state) && Set.of("claimed", "sending").contains(server.status)) {
                report(local);
            }
        }
    }

    private void send(Job queued, boolean automatic) {
        requireIdle(); requireJournal();
        long permittedEpoch = pauseEpoch.get();
        if (automatic && !enabled) return;
        api.checkUser(); lastUserCheck = System.nanoTime();
        if (api.needsMfa()) throw new PrinterFailure("mfa_required");
        readAccess();
        Scope scope = selected; String user = api.userId();
        if (scope == null || pauseEpoch.get() != permittedEpoch || (automatic && !enabled)) throw new PrinterFailure("printer_access_denied");
        // Copy recovery must be resolved before taking a server claim. Otherwise
        // a perfectly queued copy could be stranded by a missing local parent.
        journal.checkEligible(scope.tenantId, scope.locationId, queued.receipt);
        long authorizationDeadline = System.nanoTime() + 60_000_000_000L;
        ReceiptJournal.Attempt reservation = null;
        ReceiptRenderer.RenderedReceipt rendered = null;
        PrinterBinderWire.PreparedReceipt prepared = null;
        try {
            JSONObject claimed = api.rpc("mealdeck_printer_claim_job", args("p_job", queued.jobId, "p_terminal", journal.terminalId()));
            Job job = new Job(claimed);
            if (!job.jobId.equals(queued.jobId) || !"claimed".equals(job.status) || !job.receipt.fingerprint.equals(queued.receipt.fingerprint)) throw new PrinterFailure("receipt_held");
            String claim = PrinterContract.requestId(claimed.optString("claimToken", null));
            reservation = journal.reserve(scope.tenantId, scope.locationId, user, job.jobId, claim, job.receipt);
            if (!reservation.created) throw new PrinterFailure("receipt_held");
            if (!Boolean.FALSE.equals(claimed.opt("replayed"))) throw new PrinterFailure("receipt_held");
            rendered = ReceiptRenderer.render(context, job.receipt);
            prepared = PrinterBinderWire.prepareReceipt(rendered.bitmap);
            if (pauseEpoch.get() != permittedEpoch || (automatic && !enabled) || System.nanoTime() >= authorizationDeadline) throw new PrinterFailure("receipt_held");
            JSONObject begun = api.rpc("mealdeck_printer_begin_send", args("p_job", job.jobId, "p_claim", claim));
            if (!Boolean.TRUE.equals(begun.opt("ok")) || !Boolean.FALSE.equals(begun.opt("replayed")) || !"sending".equals(begun.optString("status"))) throw new PrinterFailure("receipt_held");
            JSONObject canonical = api.rpc("mealdeck_printer_claim_receipt", PrinterApi.json("p_job", job.jobId, "p_claim", claim));
            ReceiptModel fresh = ReceiptModel.parse(canonical.optJSONObject("receipt"));
            if (!job.jobId.equals(canonical.optString("jobId")) || !fresh.fingerprint.equals(job.receipt.fingerprint)
                || !user.equals(api.userId()) || selected == null || !selected.equals(scope) || pauseEpoch.get() != permittedEpoch || System.nanoTime() >= authorizationDeadline || (automatic && !enabled)) throw new PrinterFailure("receipt_held");
            PrinterServiceConnection.Verified service = verified;
            if (service == null || !connection.isCurrent(service)) throw new PrinterFailure("printer_unavailable");
            ReceiptRenderer.RenderedReceipt output = rendered;
            PrinterBinderWire.PreparedReceipt outbound = prepared;
            ReceiptJournal.Attempt saved = reservation;
            message = "Sending one receipt. Wait for its result before checking the paper.";
            var result = dispatch.send(job.jobId, new ReceiptDispatch.Transport() {
                @Override public void send(ReceiptDispatch.Permit permit) throws Exception {
                    PowerManager.WakeLock wake = context.getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "mealdeck:receipt-send");
                    try {
                        wake.acquire(35_000);
                        if (!connection.isCurrent(service) || pauseEpoch.get() != permittedEpoch || System.nanoTime() >= authorizationDeadline || (automatic && !enabled) || !permit.begin()) return;
                        if (!permit.continuing() || !connection.isCurrent(service) || pauseEpoch.get() != permittedEpoch || System.nanoTime() >= authorizationDeadline || (automatic && !enabled)) throw new IllegalStateException();
                        outbound.send(service.binder());
                    } finally { if (wake.isHeld()) wake.release(); }
                }
                @Override public void close() { outbound.close(); output.recycle(); }
            });
            rendered = null;
            prepared = null; // The dispatch now owns both resources through worker completion.
            result.whenComplete((outcome, error) -> {
                if (error != null || !"sent_unconfirmed".equals(outcome)) { enabled = false; message = INSPECT; }
                commands.execute(() -> {
                    try {
                        if (error != null) { journalHealthy = false; throw new PrinterFailure("journal_unavailable"); }
                        if (saved.userId.equals(api.userId())) report(journal.find(saved.jobId));
                        if ("sent_unconfirmed".equals(outcome)) {
                            message = enabled ? "Receipt sent. Check its paper; automatic printing remains enabled." : "Receipt sent. Check its paper; automatic printing is paused.";
                            if (soundEnabled && foreground != null && notificationsAllowed()) foreground.alert();
                        }
                        if (selected != null && api.signedIn()) readBoard();
                    } catch (Throwable failure) { handleFailure(failure); }
                    finally {
                        if (!enabled && !dispatch.active()) context.stopService(new Intent(context, ReceiptForegroundService.class));
                        rebuildSnapshot(); updateNotice();
                    }
                });
            });
        } catch (Throwable error) {
            enabled = false; message = INSPECT;
            if (reservation != null && reservation.created) {
                try { journal.finish(reservation.jobId, "held"); }
                catch (RuntimeException diskFailure) { journalHealthy = false; throw new PrinterFailure("journal_unavailable"); }
                try { if (reservation.userId.equals(api.userId())) report(journal.find(reservation.jobId)); }
                catch (PrinterFailure ignored) { /* Retry only the durable outcome metadata, never physical dispatch. */ }
            }
            if (error instanceof PrinterFailure failure) throw failure;
            throw new PrinterFailure("receipt_held");
        } finally {
            if (prepared != null) prepared.close();
            if (rendered != null) rendered.recycle();
        }
    }

    private void report(ReceiptJournal.Attempt local) {
        if (local == null || local.reported || !Set.of("held", "sent_unconfirmed").contains(local.state)) return;
        JSONObject result = api.rpc("mealdeck_printer_send_result", PrinterApi.json("p_tenant", local.tenantId, "p_location", local.locationId,
            "p_job", local.jobId, "p_claim", local.claimToken, "p_outcome", local.state));
        if (!Boolean.TRUE.equals(result.opt("ok")) || !local.state.equals(result.optString("status"))) throw new PrinterFailure("receipt_held");
        journal.markReported(local.jobId, local.state);
    }

    private void rebuildSnapshot() {
        try { rebuildSnapshotChecked(); }
        catch (RuntimeException ignored) {
            journalHealthy = false; requestPause();
            message = "Saved receipt history could not be verified. Keep printing paused and ask for support.";
            snapshot = PrinterApi.json("schemaVersion", 1, "signedIn", api.signedIn(), "needsMfa", api.needsMfa(), "factors", api.factors(),
                "scopes", new JSONArray(), "selectedScope", null, "serviceRunning", false, "serviceMessage", message,
                "connection", PrinterApi.json("available", false, "message", "Receipt history must be recovered before printing."),
                "jobs", new JSONArray(), "lastPollAt", null, "baselineAt", null,
                "notificationsAllowed", notificationsAllowed(), "soundEnabled", soundEnabled);
        }
    }

    private void rebuildSnapshotChecked() {
        JSONArray safeScopes = new JSONArray(); for (Scope scope : scopes) safeScopes.put(scope.json());
        JSONArray safeJobs = new JSONArray(); Set<String> ids = new HashSet<>();
        boolean idle = !dispatch.active();
        if (selected != null && api.signedIn() && !api.needsMfa()) {
            List<ReceiptJournal.Attempt> localRows = new ArrayList<>(journal.list(selected.tenantId, selected.locationId));
            Set<String> copyParents = new HashSet<>();
            for (Job job : jobs) if (job.receipt.reprintOf != null) {
                copyParents.add(job.receipt.reprintOf);
                if (localRows.stream().noneMatch(row -> row.jobId.equals(job.receipt.reprintOf))) {
                    ReceiptJournal.Attempt parent = journal.find(job.receipt.reprintOf);
                    if (parent != null) localRows.add(0, parent);
                }
            }
            boolean held = journal.hasHeld() || jobs.stream().anyMatch(j -> "held".equals(j.status));
            // A full server board must never hide the local hold that blocks it.
            for (ReceiptJournal.Attempt local : localRows) {
                if (safeJobs.length() >= 100) break;
                if (!Set.of("held", "sending", "sent_unconfirmed").contains(local.state) || (!"held".equals(local.state) && local.reported && !copyParents.contains(local.jobId))) continue;
                Job server = findJob(local.jobId);
                safeJobs.put(jobSummary(local.jobId, server == null ? null : orderNumber(server), local.copyNumber, local.state,
                    server == null ? Instant.ofEpochMilli(local.createdAt).toString() : server.createdAt, idle, false));
                ids.add(local.jobId);
            }
            for (Job job : jobs) {
                if (safeJobs.length() >= 100) break;
                if (ids.contains(job.jobId)) continue;
                ReceiptJournal.Attempt local = journal.find(job.jobId);
                String state = local != null && !"claimed".equals(local.state) ? local.state : job.status;
                safeJobs.put(jobSummary(job.jobId, orderNumber(job), job.receipt.copyNumber, state, job.createdAt,
                    idle && Set.of("sending", "sent_unconfirmed", "held").contains(state), idle && "queued".equals(job.status) && local == null && journalHealthy && !held && copyEligible(job)));
                ids.add(job.jobId);
            }
            for (ReceiptJournal.Attempt local : localRows) {
                if (safeJobs.length() >= 100) break;
                if (ids.contains(local.jobId) || !Set.of("held", "sending", "sent_unconfirmed").contains(local.state)) continue;
                safeJobs.put(jobSummary(local.jobId, null, local.copyNumber, local.state, Instant.ofEpochMilli(local.createdAt).toString(), idle, false));
            }
        }
        PrinterServiceConnection.Verified connected = verified;
        boolean available = connected != null && connection.isCurrent(connected);
        long baseline = selected == null ? 0 : journal.baseline(selected.tenantId, selected.locationId);
        snapshot = PrinterApi.json("schemaVersion", 1, "signedIn", api.signedIn(), "needsMfa", api.needsMfa(), "factors", api.factors(),
            "scopes", safeScopes, "selectedScope", selected == null ? null : selected.json(), "serviceRunning", enabled && foreground != null,
            "serviceMessage", message, "connection", PrinterApi.json("available", available, "message", available ? "The built-in printer service is connected." : "Check the built-in printer connection before enabling receipts."),
            "jobs", safeJobs, "lastPollAt", lastPollAt, "baselineAt", baseline <= 0 ? null : Instant.ofEpochMilli(baseline).toString(),
            "notificationsAllowed", notificationsAllowed(), "soundEnabled", soundEnabled);
    }

    private void handleFailure(Throwable error) {
        String code = error instanceof PrinterFailure failure ? failure.code : "journal_unavailable";
        if (Set.of("operation_in_progress", "invalid_credentials", "invalid_mfa_code").contains(code)) return;
        if ("network_unavailable".equals(code)) {
            message = enabled ? "Waiting for the receipt service connection. No unverified receipt will be sent." : "The receipt service could not be reached. Check Wi-Fi and try again.";
            return;
        }
        requestPause();
        if ("mfa_required".equals(code)) {
            try { api.checkUser(); } catch (RuntimeException ignored) { }
            scopes = List.of(); selected = null; jobs = List.of();
            message = "Verify your authenticator code before enabling receipts.";
        } else if (Set.of("printer_access_denied", "sign_in_required", "verified_account_required").contains(code)) {
            scopes = List.of(); selected = null; jobs = List.of(); lastPollAt = null;
            message = "Sign in with a verified account assigned to this kitchen.";
        } else if ("journal_unavailable".equals(code)) {
            journalHealthy = false; message = "Saved receipt history could not be verified. Keep printing paused and ask for support.";
        } else if ("printer_unavailable".equals(code)) message = "The built-in printer is unavailable. Check its connection and paper, then enable receipts.";
        else if (!"operation_in_progress".equals(code) && !"invalid_credentials".equals(code) && !"invalid_mfa_code".equals(code)) message = INSPECT;
        updateNotice();
    }

    private void requireIdle() { if (dispatch.active()) throw new PrinterFailure("operation_in_progress"); }
    private void requireJournal() { if (!journalHealthy) throw new PrinterFailure("journal_unavailable"); }
    private boolean notificationsAllowed() { return context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED && context.getSystemService(NotificationManager.class).areNotificationsEnabled(); }
    private void updateNotice() { ReceiptForegroundService service = foreground; if (service != null) main.post(() -> service.update(message)); }
    private Scope findScope(String tenant, String location) { for (Scope scope : scopes) if (scope.tenantId.equals(tenant) && scope.locationId.equals(location)) return scope; return null; }
    private Job findJob(String id) { for (Job job : jobs) if (job.jobId.equals(id)) return job; return null; }
    private static JSONObject jobSummary(String id, String number, int copy, String state, String createdAt, boolean confirm, boolean print) {
        return PrinterApi.json("jobId", id, "orderNumber", number, "copyNumber", copy, "status", state, "createdAt", createdAt, "canConfirm", confirm, "canPrint", print);
    }
    private static String orderNumber(Job job) {
        String number = job.receipt.toJson().optString("orderNumber", null);
        return number != null && number.matches("[0-9]{1,20}") ? number : null;
    }
    private boolean copyEligible(Job job) {
        if (job.receipt.copyNumber == 1) return true;
        try { journal.checkEligible(selected.tenantId, selected.locationId, job.receipt); return true; }
        catch (PrinterFailure failure) { if ("receipt_held".equals(failure.code)) return false; throw failure; }
    }
    private JSONObject args(Object... extra) {
        if (selected == null) throw new PrinterFailure("printer_access_denied");
        JSONObject args = PrinterApi.json("p_tenant", selected.tenantId, "p_location", selected.locationId);
        try { for (int i = 0; i < extra.length; i += 2) args.put((String) extra[i], extra[i + 1]); }
        catch (Exception ignored) { throw new IllegalArgumentException(); }
        return args;
    }
    private static String stamp(String value) { if (value == null || value.length() > 40) throw new IllegalArgumentException(); Instant.parse(value); return value; }
    private static String boundedText(Object value, int limit) { if (!(value instanceof String text) || text.length() > limit || text.matches(".*[\\p{Cc}\\p{Cf}].*")) throw new IllegalArgumentException(); return text; }
}
