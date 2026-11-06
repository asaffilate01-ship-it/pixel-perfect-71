package uk.co.mealdeck.printerprobe;

interface SetupJournal {
    record Test(String requestId, String status, String createdAt, String updatedAt, String message) {}
    record Reservation(Test test, boolean created) {}

    Test find(String requestId);
    Test current();
    Reservation reserve(String requestId, String now);
    Test finishSending(String requestId, String status, String now, String message);
    Test confirm(String requestId, String outcome, String now);
    void recoverInterrupted(String now);

    static boolean unresolved(String status) {
        return "sending".equals(status) || "sent_unconfirmed".equals(status) || "held".equals(status);
    }
}
