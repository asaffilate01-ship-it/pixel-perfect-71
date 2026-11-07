package uk.co.mealdeck.printer;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;

/** A timeout settles the UI but never releases a still-running Binder slot. */
final class ReceiptDispatch {
    interface Journal {
        void begin(String jobId);
        void finish(String jobId, String outcome);
    }
    interface Permit { boolean begin(); boolean continuing(); }
    interface Transport { void send(Permit permit) throws Exception; }
    interface Cancellation { void cancel(); }
    interface Deadlines { Cancellation schedule(Runnable work, long delayMs); }
    private final Journal journal;
    private final Executor worker;
    private final Deadlines deadlines;
    private Active active;

    private static final class Active {
        final String jobId;
        final CompletableFuture<String> result = new CompletableFuture<>();
        Cancellation deadline;
        boolean expired;
        boolean begun;
        Active(String jobId) { this.jobId = jobId; }
    }

    ReceiptDispatch(Journal journal, Executor worker, Deadlines deadlines) {
        this.journal = journal; this.worker = worker; this.deadlines = deadlines;
    }

    synchronized boolean active() { return active != null; }

    synchronized CompletableFuture<String> send(String jobId, Transport transport) {
        if (active != null) throw new PrinterFailure("operation_in_progress");
        Active attempt = new Active(jobId); active = attempt;
        try {
            attempt.deadline = deadlines.schedule(() -> expire(attempt), 30_000);
            worker.execute(() -> run(attempt, transport));
        } catch (RuntimeException ignored) { finish(attempt, false); }
        return attempt.result;
    }

    synchronized void interrupt() { if (active != null) expire(active); }

    private synchronized boolean begin(Active attempt) {
        if (active != attempt || attempt.expired || attempt.begun) return false;
        journal.begin(attempt.jobId); // durable sending state before first IPC
        attempt.begun = true;
        return true;
    }

    private synchronized boolean continuing(Active attempt) {
        return active == attempt && attempt.begun && !attempt.expired;
    }

    private void run(Active attempt, Transport transport) {
        boolean returned = false;
        try {
            transport.send(new Permit() {
                @Override public boolean begin() { return ReceiptDispatch.this.begin(attempt); }
                @Override public boolean continuing() { return ReceiptDispatch.this.continuing(attempt); }
            });
            returned = true;
        } catch (Exception | LinkageError | OutOfMemoryError ignored) {
            // Vendor exception strings and receipt details never leave native code.
        } finally { finish(attempt, returned); }
    }

    private synchronized void expire(Active attempt) {
        if (active != attempt || attempt.expired) return;
        attempt.expired = true;
        try { journal.finish(attempt.jobId, "held"); attempt.result.complete("held"); }
        catch (RuntimeException ignored) { attempt.result.completeExceptionally(new PrinterFailure("journal_unavailable")); }
        // Do not cancel the Binder worker and do not clear active here.
    }

    private synchronized void finish(Active attempt, boolean returned) {
        if (active != attempt) return;
        if (attempt.deadline != null) attempt.deadline.cancel();
        try {
            String outcome = returned && attempt.begun && !attempt.expired ? "sent_unconfirmed" : "held";
            journal.finish(attempt.jobId, outcome);
            attempt.result.complete(outcome);
        } catch (RuntimeException ignored) { attempt.result.completeExceptionally(new PrinterFailure("journal_unavailable")); }
        finally { active = null; }
    }
}
