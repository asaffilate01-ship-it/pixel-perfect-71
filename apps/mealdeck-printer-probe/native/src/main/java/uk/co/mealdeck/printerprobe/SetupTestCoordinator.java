package uk.co.mealdeck.printerprobe;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import java.util.function.Supplier;

/** One durable reservation, at most one dispatch, and no automatic retry. */
final class SetupTestCoordinator {
    interface DispatchPermit { boolean begin(); }
    interface Transport { void send(DispatchPermit permit) throws Exception; }
    interface Cancellation { void cancel(); }
    interface Deadlines { Cancellation schedule(Runnable work, long delayMs); }

    private static final String UNCERTAIN =
        "The setup-test outcome is uncertain. Do not print again; inspect the printer and paper first.";
    private final SetupJournal journal;
    private final Transport transport;
    private final Executor worker;
    private final Deadlines deadlines;
    private final Supplier<String> clock;
    private Active active;

    private static final class Active {
        final String requestId;
        final CompletableFuture<SetupJournal.Test> response = new CompletableFuture<>();
        Cancellation deadline;
        boolean expired;
        boolean dispatchStarted;
        Active(String requestId) { this.requestId = requestId; }
    }

    SetupTestCoordinator(SetupJournal journal, Transport transport, Executor worker,
                         Deadlines deadlines, Supplier<String> clock) {
        this.journal = journal;
        this.transport = transport;
        this.worker = worker;
        this.deadlines = deadlines;
        this.clock = clock;
        // The runtime is a process singleton. This runs only on a fresh process.
        journal.recoverInterrupted(clock.get());
    }

    synchronized SetupJournal.Test current() { return journal.current(); }

    synchronized CompletableFuture<SetupJournal.Test> print(String suppliedRequestId) {
        String requestId = ProbeContract.requestId(suppliedRequestId);
        SetupJournal.Test existing = journal.find(requestId);
        if (existing != null) return CompletableFuture.completedFuture(existing);
        if (active != null) throw new IllegalStateException("The printer is still finishing an earlier test. Check its status first.");
        // SQLite commits this reservation before the worker can reach any send.
        SetupJournal.Reservation reservation = journal.reserve(requestId, clock.get());
        if (!reservation.created()) return CompletableFuture.completedFuture(reservation.test());
        Active attempt = new Active(requestId);
        active = attempt;
        try {
            attempt.deadline = deadlines.schedule(() -> expire(attempt), ProbeContract.SETUP_TIMEOUT_MS);
            worker.execute(() -> run(attempt));
        } catch (RuntimeException error) {
            finish(attempt, false);
        }
        return attempt.response;
    }

    synchronized SetupJournal.Test confirm(String suppliedRequestId, String outcome) {
        String requestId = ProbeContract.requestId(suppliedRequestId);
        if (!"printed".equals(outcome) && !"not_printed".equals(outcome)) {
            throw new IllegalArgumentException("Inspect the paper and choose printed or not printed.");
        }
        // A Binder timeout does not cancel the remote transaction. Its eventual
        // return must not race paper confirmation or another physical send.
        if (active != null) throw new IllegalStateException("The printer call is still running. Wait for it to settle before confirming paper.");
        return journal.confirm(requestId, outcome, clock.get());
    }

    synchronized void interrupt() {
        if (active != null) expire(active);
    }

    private synchronized boolean beginDispatch(Active attempt) {
        if (active != attempt || attempt.expired || attempt.dispatchStarted) return false;
        SetupJournal.Test stored = journal.find(attempt.requestId);
        if (stored == null || !"sending".equals(stored.status())) return false;
        attempt.dispatchStarted = true;
        return true;
    }

    private void run(Active attempt) {
        boolean returned = false;
        try {
            transport.send(() -> beginDispatch(attempt));
            returned = true;
        } catch (Exception | LinkageError | OutOfMemoryError ignored) {
            // Never expose vendor exceptions, receipt data or device identifiers.
        } finally {
            finish(attempt, returned);
        }
    }

    private synchronized void expire(Active attempt) {
        if (active != attempt || attempt.expired) return;
        attempt.expired = true;
        try {
            SetupJournal.Test held = journal.finishSending(attempt.requestId, "held", clock.get(), UNCERTAIN);
            attempt.response.complete(held);
        } catch (RuntimeException error) {
            attempt.response.completeExceptionally(new IllegalStateException("The saved test state could not be verified. Do not start another test."));
        }
        // Retain active until the worker actually exits. Do not cancel/forget a
        // possibly executing Binder transaction when its UI deadline expires.
    }

    private synchronized void finish(Active attempt, boolean returned) {
        if (active != attempt) return;
        if (attempt.deadline != null) attempt.deadline.cancel();
        try {
            boolean sent = returned && attempt.dispatchStarted && !attempt.expired;
            SetupJournal.Test stored = journal.finishSending(
                attempt.requestId,
                sent ? "sent_unconfirmed" : "held",
                clock.get(),
                sent ? "The printer service accepted the setup sample. Inspect the paper; printing is not yet confirmed." : UNCERTAIN
            );
            attempt.response.complete(stored);
        } catch (RuntimeException error) {
            attempt.response.completeExceptionally(new IllegalStateException("The saved test state could not be verified. Do not start another test."));
        } finally {
            active = null;
        }
    }
}
