package uk.co.mealdeck.printer;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;

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
            check(permit.begin()); timeout.events.add("first-strip:b"); timeout.timeout.run();
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
        var uncertain = partial.dispatch.send("f", permit -> { check(permit.begin()); partial.events.add("first-strip:f"); throw new IllegalStateException(); });
        partial.worker.run(); check(uncertain.join().equals("held")); check(!partial.events.contains("sent_unconfirmed:f"));
        System.out.println("Receipt dispatch: durable-before-IPC, no overlap, timeout retention, interruption and partial-send checks passed.");
    }
}
