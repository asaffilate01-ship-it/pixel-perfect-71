package uk.co.mealdeck.printerprobe;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

/** Private diagnostic records only. No receipts, customers, credentials or network. */
final class SqliteSetupJournal extends SQLiteOpenHelper implements SetupJournal {
    SqliteSetupJournal(Context context) {
        super(context, "mealdeck-printer-setup-v1.db", null, 1);
        setWriteAheadLoggingEnabled(false);
    }

    @Override public void onConfigure(SQLiteDatabase db) {
        db.execSQL("PRAGMA synchronous=FULL");
    }

    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE setup_tests (" +
            "sequence INTEGER PRIMARY KEY AUTOINCREMENT," +
            "request_id TEXT NOT NULL UNIQUE," +
            "status TEXT NOT NULL CHECK(status IN ('sending','sent_unconfirmed','held','printed','not_printed'))," +
            "open_slot INTEGER UNIQUE," +
            "created_at TEXT NOT NULL,updated_at TEXT NOT NULL,message TEXT NOT NULL," +
            "CHECK((status IN ('sending','sent_unconfirmed','held') AND open_slot IS 1) OR " +
            "(status IN ('printed','not_printed') AND open_slot IS NULL)))");
    }

    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        throw new IllegalStateException("The saved test journal needs a reviewed upgrade. Do not reset it.");
    }

    @Override public synchronized Test find(String requestId) { return find(getReadableDatabase(), requestId); }

    private Test find(SQLiteDatabase db, String requestId) {
        try (Cursor cursor = db.rawQuery("SELECT request_id,status,created_at,updated_at,message FROM setup_tests WHERE request_id=?", new String[]{requestId})) {
            return cursor.moveToFirst() ? read(cursor) : null;
        }
    }

    @Override public synchronized Test current() {
        try (Cursor cursor = getReadableDatabase().rawQuery(
            "SELECT request_id,status,created_at,updated_at,message FROM setup_tests ORDER BY (open_slot IS 1) DESC,sequence DESC LIMIT 1", null)) {
            return cursor.moveToFirst() ? read(cursor) : null;
        }
    }

    @Override public synchronized Reservation reserve(String requestId, String now) {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            Test existing = find(db, requestId);
            if (existing != null) { db.setTransactionSuccessful(); return new Reservation(existing, false); }
            try (Cursor cursor = db.rawQuery("SELECT 1 FROM setup_tests WHERE open_slot IS 1 LIMIT 1", null)) {
                if (cursor.moveToFirst()) throw new IllegalStateException("Resolve the previous setup test after inspecting its paper before starting another.");
            }
            ContentValues values = new ContentValues();
            values.put("request_id", requestId);
            values.put("status", "sending");
            values.put("open_slot", 1);
            values.put("created_at", now);
            values.put("updated_at", now);
            values.put("message", "The setup test is reserved. Do not start another test while its outcome is unresolved.");
            db.insertOrThrow("setup_tests", null, values);
            Test stored = find(db, requestId);
            db.setTransactionSuccessful();
            return new Reservation(stored, true);
        } finally { db.endTransaction(); }
    }

    @Override public synchronized Test finishSending(String requestId, String status, String now, String message) {
        if (!"sent_unconfirmed".equals(status) && !"held".equals(status)) throw new IllegalArgumentException("Invalid transport outcome.");
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            ContentValues values = new ContentValues();
            values.put("status", status);
            values.put("updated_at", now);
            values.put("message", message);
            db.update("setup_tests", values, "request_id=? AND status='sending'", new String[]{requestId});
            Test stored = find(db, requestId);
            if (stored == null) throw new IllegalStateException("The reserved setup test is missing. Do not print again.");
            db.setTransactionSuccessful();
            return stored;
        } finally { db.endTransaction(); }
    }

    @Override public synchronized Test confirm(String requestId, String outcome, String now) {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            Test existing = find(db, requestId);
            if (existing == null) throw new IllegalStateException("That setup test was not found in the saved journal.");
            if (outcome.equals(existing.status())) { db.setTransactionSuccessful(); return existing; }
            if (!"held".equals(existing.status()) && !"sent_unconfirmed".equals(existing.status())) {
                throw new IllegalStateException("This test is still sending or already has a recorded paper result.");
            }
            ContentValues values = new ContentValues();
            values.put("status", outcome);
            values.putNull("open_slot");
            values.put("updated_at", now);
            values.put("message", "printed".equals(outcome) ? "The operator confirmed the setup sample printed." : "The operator confirmed the setup sample did not print.");
            db.update("setup_tests", values, "request_id=? AND status IN ('held','sent_unconfirmed')", new String[]{requestId});
            Test stored = find(db, requestId);
            db.setTransactionSuccessful();
            return stored;
        } finally { db.endTransaction(); }
    }

    @Override public synchronized void recoverInterrupted(String now) {
        ContentValues values = new ContentValues();
        values.put("status", "held");
        values.put("updated_at", now);
        values.put("message", "The app stopped during a setup test. Inspect the printer and paper; this test will not be sent again.");
        getWritableDatabase().update("setup_tests", values, "status='sending'", null);
    }

    private static Test read(Cursor cursor) {
        return new Test(cursor.getString(0), cursor.getString(1), cursor.getString(2), cursor.getString(3), cursor.getString(4));
    }
}
