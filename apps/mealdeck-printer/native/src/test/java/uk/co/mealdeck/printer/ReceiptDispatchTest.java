package uk.co.mealdeck.printer;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.function.BooleanSupplier;

/** Runs without Android: proves the actual global dispatch/recovery boundary. */
public final class ReceiptDispatchTest {
    private static void check(boolean value) { if (!value) throw new AssertionError(); }
    static final class Fixture implements ReceiptDispatch.Journal {
        final List<String> events = new ArrayList<>();
        Runnable worker; Runnable timeout; boolean failBegin;
        final ReceiptDispatch dispatch = new ReceiptDispatch(this, action -> worker = action,
            (action, delay) -> { timeout = action; return () -> {}; });
        public void begin(String id) { if (failBegin) throw new IllegalStateException(); events.add("begin:" + id); }
        public void finish(String id, String state) { events.add(state + ":" + id); }
    }
    public static void main(String[] args) {
        Fixture normal = new Fixture();
        var result = normal.dispatch.send("a", permit -> { check(permit.begin()); check(permit.continuing()); normal.events.add("ipc:a"); });
        check(!result.isDone()); normal.worker.run();
        check(result.join().equals("sent_unconfirmed"));
        check(normal.events.equals(List.of("begin:a", "ipc:a", "sent_unconfirmed:a")));

        Fixture timeout = new Fixture();
        var held = timeout.dispatch.send("b", permit -> {
            check(permit.begin()); timeout.events.add("ipc-start:b"); timeout.timeout.run();
            check(timeout.dispatch.active()); check(!permit.continuing());
            boolean blocked = false; try { timeout.dispatch.send("c", p -> {}); } catch (PrinterFailure expected) { blocked = true; }
            check(blocked);
        });
        timeout.worker.run(); check(held.join().equals("held")); check(!timeout.dispatch.active());
        check(!timeout.events.contains("sent_unconfirmed:b"));

        Fixture before = new Fixture();
        var cancelled = before.dispatch.send("d", permit -> { check(!permit.begin()); check(!permit.continuing()); });
        before.dispatch.interrupt(); check(cancelled.join().equals("held")); check(before.dispatch.active());
        before.worker.run(); check(!before.events.contains("begin:d"));

        Fixture failed = new Fixture(); failed.failBegin = true;
        var disk = failed.dispatch.send("e", permit -> { permit.begin(); failed.events.add("ipc:e"); });
        failed.worker.run(); check(disk.join().equals("held")); check(!failed.events.contains("ipc:e"));

        Fixture partial = new Fixture();
        var uncertain = partial.dispatch.send("f", permit -> { check(permit.begin()); partial.events.add("ipc-start:f"); throw new IllegalStateException(); });
        partial.worker.run(); check(uncertain.join().equals("held")); check(!partial.events.contains("sent_unconfirmed:f"));

        Fixture resources = new Fixture();
        resources.dispatch.send("g", new ReceiptDispatch.Transport() {
            public void send(ReceiptDispatch.Permit permit) {
                check(permit.begin()); resources.timeout.run();
                check(!resources.events.contains("closed:g"));
                check(resources.dispatch.active());
                resources.events.add("binder-return:g");
            }
            public void close() { resources.events.add("closed:g"); }
        });
        resources.worker.run();
        check(resources.events.indexOf("closed:g") > resources.events.indexOf("binder-return:g"));
        check(resources.events.stream().filter(e -> e.equals("closed:g")).count() == 1);

        List<String> rejected = new ArrayList<>();
        ReceiptDispatch unavailable = new ReceiptDispatch(new ReceiptDispatch.Journal() {
            public void begin(String id) { throw new AssertionError("No IPC after worker rejection"); }
            public void finish(String id, String outcome) { rejected.add(outcome); }
        }, action -> { throw new java.util.concurrent.RejectedExecutionException(); }, (action, delay) -> () -> {});
        var rejectedResult = unavailable.send("h", new ReceiptDispatch.Transport() {
            public void send(ReceiptDispatch.Permit permit) { throw new AssertionError("No worker available"); }
            public void close() { rejected.add("closed"); }
        });
        check(rejectedResult.join().equals("held"));
        check(rejected.equals(List.of("closed", "held")));
        check(!unavailable.active());

        bitmapAndFeedShareOneDispatch();
        feedFailureHoldsTheOriginalAttempt();
        deadlineDuringFeedRetainsSlotAndResources();
        deadlineAfterBitmapSkipsFeed();
        System.out.println("Receipt dispatch: durable-before-IPC, bitmap/feed ordering, no overlap, finalization failures, timeout retention, interruption, uncertain-send and resource ownership checks passed.");
    }

    /** The Binder protocol is checked on Android; these transports exercise the
     * actual dispatcher while the bitmap and final feed settle independently. */
    private static void bitmapAndFeedShareOneDispatch() {
        Fixture fixture = new Fixture();
        CompletableFuture<String> result = fixture.dispatch.send("complete", new ReceiptDispatch.Transport() {
            @Override public void send(ReceiptDispatch.Permit permit) {
                check(permit.begin());
                fixture.events.add("bitmap-return:complete");
                check(fixture.dispatch.active());
                rejectNextReceipt(fixture);
                check(permit.continuing());
                fixture.events.add("feed-start:complete");
                rejectNextReceipt(fixture);
                check(!fixture.events.contains("sent_unconfirmed:complete"));
                fixture.events.add("feed-return:complete");
            }
            @Override public void close() { fixture.events.add("closed:complete"); }
        });
        result.thenAccept(outcome -> fixture.events.add("result:" + outcome));
        check(!result.isDone());
        fixture.worker.run();
        check(result.join().equals("sent_unconfirmed"));
        check(fixture.events.equals(List.of("begin:complete", "bitmap-return:complete", "feed-start:complete",
            "feed-return:complete", "closed:complete", "sent_unconfirmed:complete", "result:sent_unconfirmed")));
        check(!fixture.dispatch.active());

        // A different job is admitted only after the full first transport exits.
        CompletableFuture<String> next = fixture.dispatch.send("next", permit -> {
            check(permit.begin());
            check(permit.continuing());
            fixture.events.add("bitmap-return:next");
            fixture.events.add("feed-return:next");
        });
        fixture.worker.run();
        check(next.join().equals("sent_unconfirmed"));
        check(fixture.events.indexOf("begin:next") > fixture.events.indexOf("feed-return:complete"));
    }

    private static void feedFailureHoldsTheOriginalAttempt() {
        Fixture fixture = new Fixture();
        CompletableFuture<String> result = fixture.dispatch.send("feed-failed", new ReceiptDispatch.Transport() {
            @Override public void send(ReceiptDispatch.Permit permit) {
                check(permit.begin());
                fixture.events.add("bitmap-return:feed-failed");
                check(permit.continuing());
                fixture.events.add("feed-start:feed-failed");
                rejectNextReceipt(fixture);
                throw new IllegalStateException("The final feed did not return successfully.");
            }
            @Override public void close() { fixture.events.add("closed:feed-failed"); }
        });
        fixture.worker.run();
        check(result.join().equals("held"));
        check(fixture.events.equals(List.of("begin:feed-failed", "bitmap-return:feed-failed", "feed-start:feed-failed",
            "closed:feed-failed", "held:feed-failed")));
        check(!fixture.dispatch.active());
    }

    private static void deadlineDuringFeedRetainsSlotAndResources() {
        Fixture fixture = new Fixture();
        CompletableFuture<String> result = fixture.dispatch.send("feed-timeout", new ReceiptDispatch.Transport() {
            @Override public void send(ReceiptDispatch.Permit permit) {
                check(permit.begin());
                fixture.events.add("bitmap-return:feed-timeout");
                check(permit.continuing());
                fixture.events.add("feed-start:feed-timeout");
                fixture.timeout.run();
                check(fixture.events.contains("result:held"));
                check(fixture.dispatch.active());
                check(!permit.continuing());
                check(!fixture.events.contains("closed:feed-timeout"));
                rejectNextReceipt(fixture);
                fixture.events.add("feed-return:feed-timeout");
            }
            @Override public void close() { fixture.events.add("closed:feed-timeout"); }
        });
        result.thenAccept(outcome -> fixture.events.add("result:" + outcome));
        fixture.worker.run();
        check(result.join().equals("held"));
        check(fixture.events.equals(List.of("begin:feed-timeout", "bitmap-return:feed-timeout", "feed-start:feed-timeout",
            "held:feed-timeout", "result:held", "feed-return:feed-timeout", "closed:feed-timeout", "held:feed-timeout")));
        check(!fixture.dispatch.active());
    }

    private static void deadlineAfterBitmapSkipsFeed() {
        Fixture fixture = new Fixture();
        CompletableFuture<String> result = fixture.dispatch.send("between-stages", new ReceiptDispatch.Transport() {
            @Override public void send(ReceiptDispatch.Permit permit) {
                check(permit.begin());
                BooleanSupplier continuing = permit::continuing;
                fixture.events.add("bitmap-return:between-stages");
                fixture.timeout.run();
                check(fixture.dispatch.active());
                check(!fixture.events.contains("closed:between-stages"));
                rejectNextReceipt(fixture);
                if (!continuing.getAsBoolean()) throw new IllegalStateException("Dispatch expired before its final feed.");
                fixture.events.add("feed-start:between-stages");
            }
            @Override public void close() { fixture.events.add("closed:between-stages"); }
        });
        fixture.worker.run();
        check(result.join().equals("held"));
        check(fixture.events.equals(List.of("begin:between-stages", "bitmap-return:between-stages", "held:between-stages",
            "closed:between-stages", "held:between-stages")));
        check(!fixture.dispatch.active());
    }

    private static void rejectNextReceipt(Fixture fixture) {
        try {
            fixture.dispatch.send("must-wait", permit -> { throw new AssertionError("A second receipt reached the worker."); });
        } catch (PrinterFailure expected) {
            check("operation_in_progress".equals(expected.code));
            return;
        }
        throw new AssertionError("A second receipt was admitted before finalization returned.");
    }
}
