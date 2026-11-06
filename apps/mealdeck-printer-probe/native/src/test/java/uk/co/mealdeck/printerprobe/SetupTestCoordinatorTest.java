package uk.co.mealdeck.printerprobe;

import java.util.ArrayDeque;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicInteger;

/** JDK-only behavioral checks; Android SQLite and device acceptance remain separate. */
public final class SetupTestCoordinatorTest {
    private static final String FIRST = "8bb00372-65e6-43ef-9382-9472696f1e52";
    private static final String SECOND = "8bb00372-65e6-43ef-9382-9472696f1e53";
    private static final String NOW = "2026-11-06T21:30:00.000Z";
    private static int passed;

    public static void main(String[] args) throws Exception {
        run("pinned Binder operations and strict UUID boundary", () -> {
            equal(2, ProbeContract.GET_SERVICE_VERSION);
            equal(4, ProbeContract.PRINT_BITMAP);
            equal("recieptservice.com.recieptservice.PrinterInterface", ProbeContract.DESCRIPTOR);
            check(ProbeContract.BITMAP_WIDTH <= 256 && ProbeContract.BITMAP_HEIGHT <= 640, "bounded sample");
            equal(FIRST, ProbeContract.requestId(FIRST.toUpperCase()));
            denied(() -> ProbeContract.requestId("1-2-3-4-5"));
            denied(() -> ProbeContract.requestId(FIRST + "\n"));
            denied(() -> ProbeContract.requestId(null));
            equal("13", ProbeContract.safeMetadata("13\u0000\u202e"));
        });

        run("reservation precedes dispatch and same UUID never resends", () -> {
            Fixture f = new Fixture();
            CompletableFuture<SetupJournal.Test> first = f.coordinator.print(FIRST);
            equal("sending", f.journal.find(FIRST).status());
            equal(0, f.sends.get());
            equal("sending", f.coordinator.print(FIRST).join().status());
            equal(1, f.worker.size());
            f.worker.drain();
            equal("sent_unconfirmed", first.join().status());
            equal(1, f.sends.get());
            equal("sent_unconfirmed", f.coordinator.print(FIRST).join().status());
            equal(0, f.worker.size());
        });

        run("only inspected paper closes the unresolved slot", () -> {
            Fixture f = new Fixture();
            f.coordinator.print(FIRST);
            f.worker.drain();
            denied(() -> f.coordinator.print(SECOND));
            denied(() -> f.coordinator.confirm(FIRST, "success"));
            equal("printed", f.coordinator.confirm(FIRST, "printed").status());
            equal("printed", f.coordinator.confirm(FIRST, "printed").status());
            denied(() -> f.coordinator.confirm(FIRST, "not_printed"));
            equal("printed", f.coordinator.print(FIRST).join().status());
            f.coordinator.print(SECOND);
            f.worker.drain();
            equal(2, f.sends.get());
        });

        run("deadline before dispatch blocks the delayed worker", () -> {
            Fixture f = new Fixture();
            CompletableFuture<SetupJournal.Test> result = f.coordinator.print(FIRST);
            f.deadlines.fire();
            equal("held", result.join().status());
            denied(() -> f.coordinator.confirm(FIRST, "not_printed"));
            denied(() -> f.coordinator.print(SECOND));
            f.worker.drain();
            equal(0, f.sends.get());
            equal("held", f.coordinator.current().status());
            f.coordinator.confirm(FIRST, "not_printed");
            f.coordinator.print(SECOND);
            f.worker.drain();
            equal(1, f.sends.get());
        });

        run("deadline after dispatch remains held after late return", () -> {
            Fixture f = new Fixture();
            f.duringSend = () -> {
                f.deadlines.fire();
                equal("held", f.coordinator.current().status());
                denied(() -> f.coordinator.confirm(FIRST, "not_printed"));
                denied(() -> f.coordinator.print(SECOND));
            };
            CompletableFuture<SetupJournal.Test> result = f.coordinator.print(FIRST);
            f.worker.drain();
            equal("held", result.join().status());
            equal("held", f.coordinator.current().status());
            equal(1, f.sends.get());
            f.coordinator.print(FIRST);
            f.worker.drain();
            equal(1, f.sends.get());
            equal("printed", f.coordinator.confirm(FIRST, "printed").status());
        });

        run("remote exception holds the test without automatic fallback", () -> {
            Fixture f = new Fixture();
            f.duringSend = () -> { throw new IllegalStateException("simulated uncertain Binder result"); };
            CompletableFuture<SetupJournal.Test> result = f.coordinator.print(FIRST);
            f.worker.drain();
            equal("held", result.join().status());
            equal(1, f.sends.get());
            f.coordinator.print(FIRST);
            f.worker.drain();
            equal(1, f.sends.get());
            denied(() -> f.coordinator.print(SECOND));
        });

        run("capability failure before send still preserves the reservation", () -> {
            Fixture f = new Fixture();
            f.beforePermit = () -> { throw new IllegalStateException("service missing"); };
            CompletableFuture<SetupJournal.Test> result = f.coordinator.print(FIRST);
            f.worker.drain();
            equal("held", result.join().status());
            equal(0, f.sends.get());
            equal("held", f.coordinator.print(FIRST).join().status());
        });

        run("recovered sending record is held and never replayed", () -> {
            FakeJournal journal = new FakeJournal();
            journal.reserve(FIRST, NOW);
            Fixture f = new Fixture(journal);
            equal("held", f.coordinator.current().status());
            equal("held", f.coordinator.print(FIRST).join().status());
            denied(() -> f.coordinator.print(SECOND));
            f.worker.drain();
            equal(0, f.sends.get());
            f.coordinator.confirm(FIRST, "not_printed");
            f.coordinator.print(SECOND);
            f.worker.drain();
            equal(1, f.sends.get());
        });

        run("activity interruption cannot release a queued send", () -> {
            Fixture f = new Fixture();
            CompletableFuture<SetupJournal.Test> result = f.coordinator.print(FIRST);
            f.coordinator.interrupt();
            equal("held", result.join().status());
            f.worker.drain();
            equal(0, f.sends.get());
            equal("held", f.coordinator.current().status());
        });

        run("journal failure before reservation prevents dispatch", () -> {
            Fixture f = new Fixture();
            f.journal.rejectReservation = true;
            denied(() -> f.coordinator.print(FIRST));
            f.worker.drain();
            equal(0, f.sends.get());
            check(f.coordinator.current() == null, "no fabricated saved test");
        });

        run("lost completion persistence retains sending until restart recovery", () -> {
            Fixture f = new Fixture();
            f.journal.rejectFinish = true;
            CompletableFuture<SetupJournal.Test> result = f.coordinator.print(FIRST);
            f.worker.drain();
            check(result.isCompletedExceptionally(), "unknown completion must reject");
            equal("sending", f.coordinator.current().status());
            equal("sending", f.coordinator.print(FIRST).join().status());
            denied(() -> f.coordinator.print(SECOND));
            denied(() -> f.coordinator.confirm(FIRST, "not_printed"));
            equal(1, f.sends.get());
        });

        run("concurrent same UUID calls schedule one physical send", () -> {
            Fixture f = new Fixture();
            CountDownLatch start = new CountDownLatch(1);
            AtomicInteger failures = new AtomicInteger();
            Thread[] callers = new Thread[24];
            for (int i = 0; i < callers.length; i++) {
                callers[i] = new Thread(() -> {
                    try { start.await(); f.coordinator.print(FIRST); }
                    catch (Exception error) { failures.incrementAndGet(); }
                });
                callers[i].start();
            }
            start.countDown();
            for (Thread caller : callers) caller.join(2_000);
            for (Thread caller : callers) check(!caller.isAlive(), "bounded concurrent request");
            equal(0, failures.get());
            equal(1, f.worker.size());
            f.worker.drain();
            equal(1, f.sends.get());
        });
        System.out.println("PASS " + passed + " native diagnostic behavior groups");
    }

    private interface Check { void run() throws Exception; }
    private static void run(String name, Check check) throws Exception {
        check.run();
        passed++;
        System.out.println("PASS " + name);
    }
    private static void check(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
    private static void equal(Object expected, Object actual) {
        if (!expected.equals(actual)) throw new AssertionError("Expected " + expected + ", got " + actual);
    }
    private static void denied(Runnable work) {
        try { work.run(); } catch (IllegalArgumentException | IllegalStateException expected) { return; }
        throw new AssertionError("Expected a rejected unsafe action");
    }

    private static final class Fixture {
        final FakeJournal journal;
        final ManualExecutor worker = new ManualExecutor();
        final ManualDeadlines deadlines = new ManualDeadlines();
        final AtomicInteger sends = new AtomicInteger();
        final SetupTestCoordinator coordinator;
        Runnable beforePermit = () -> {};
        Runnable duringSend = () -> {};
        Fixture() { this(new FakeJournal()); }
        Fixture(FakeJournal journal) {
            this.journal = journal;
            coordinator = new SetupTestCoordinator(journal, permit -> {
                beforePermit.run();
                if (!permit.begin()) return;
                check(journal.current() != null && "sending".equals(journal.current().status()), "persisted before send");
                check(!permit.begin(), "one permit per test");
                sends.incrementAndGet();
                duringSend.run();
            }, worker, deadlines, () -> NOW);
        }
    }

    private static final class ManualExecutor implements Executor {
        private final ArrayDeque<Runnable> work = new ArrayDeque<>();
        @Override public synchronized void execute(Runnable task) { work.add(task); }
        synchronized int size() { return work.size(); }
        void drain() {
            while (true) {
                Runnable task;
                synchronized (this) { task = work.poll(); }
                if (task == null) return;
                task.run();
            }
        }
    }

    private static final class ManualDeadlines implements SetupTestCoordinator.Deadlines {
        Runnable pending;
        @Override public SetupTestCoordinator.Cancellation schedule(Runnable task, long delayMs) {
            check(delayMs > 0, "bounded deadline");
            pending = task;
            return () -> { if (pending == task) pending = null; };
        }
        void fire() { Runnable task = pending; pending = null; if (task != null) task.run(); }
    }

    /** Models committed rows across coordinator restarts; not a SQLite emulator. */
    private static final class FakeJournal implements SetupJournal {
        final Map<String, Test> records = new LinkedHashMap<>();
        boolean rejectReservation;
        boolean rejectFinish;
        @Override public synchronized Test find(String id) { return records.get(id); }
        @Override public synchronized Test current() {
            Test last = null;
            for (Test test : records.values()) { if (SetupJournal.unresolved(test.status())) return test; last = test; }
            return last;
        }
        @Override public synchronized Reservation reserve(String id, String now) {
            if (rejectReservation) throw new IllegalStateException("simulated storage failure");
            if (records.containsKey(id)) return new Reservation(records.get(id), false);
            for (Test test : records.values()) if (SetupJournal.unresolved(test.status())) throw new IllegalStateException("unresolved test");
            Test test = new Test(id, "sending", now, now, "reserved");
            records.put(id, test);
            return new Reservation(test, true);
        }
        @Override public synchronized Test finishSending(String id, String status, String now, String message) {
            if (rejectFinish) throw new IllegalStateException("simulated persistence failure");
            Test old = records.get(id);
            if (old == null) throw new IllegalStateException("missing reservation");
            if (!"sending".equals(old.status())) return old;
            Test next = new Test(id, status, old.createdAt(), now, message);
            records.put(id, next);
            return next;
        }
        @Override public synchronized Test confirm(String id, String outcome, String now) {
            Test old = records.get(id);
            if (old == null) throw new IllegalStateException("missing test");
            if (outcome.equals(old.status())) return old;
            if (!"held".equals(old.status()) && !"sent_unconfirmed".equals(old.status())) throw new IllegalStateException("immutable or sending");
            Test next = new Test(id, outcome, old.createdAt(), now, "operator result");
            records.put(id, next);
            return next;
        }
        @Override public synchronized void recoverInterrupted(String now) {
            for (Test test : new java.util.ArrayList<>(records.values())) {
                if ("sending".equals(test.status())) finishSending(test.requestId(), "held", now, "interrupted");
            }
        }
    }
}
