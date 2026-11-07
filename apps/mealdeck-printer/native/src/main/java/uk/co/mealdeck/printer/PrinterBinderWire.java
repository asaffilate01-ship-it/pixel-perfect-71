package uk.co.mealdeck.printer;

import android.graphics.Bitmap;
import android.os.IBinder;
import android.os.Parcel;
import android.os.RemoteException;
import java.util.function.BooleanSupplier;

/** Minimal IPC implementation of the pinned public interface; see SOURCE.md. */
final class PrinterBinderWire {
    private PrinterBinderWire() {}

    static String serviceVersion(IBinder binder) throws RemoteException {
        Parcel request = Parcel.obtain();
        Parcel reply = Parcel.obtain();
        try {
            request.writeInterfaceToken(PrinterContract.DESCRIPTOR);
            if (!binder.transact(PrinterContract.GET_SERVICE_VERSION, request, reply, 0)) {
                throw new RemoteException("Printer service version operation unavailable.");
            }
            reply.readException();
            return PrinterContract.safeMetadata(reply.readString());
        } finally {
            reply.recycle();
            request.recycle();
        }
    }

    /** Prepare the complete immutable receipt before the server enters sending.
     * Bitmap.asShared() uses Android's ordinary Bitmap Parcelable wire format;
     * its pixels travel through shared memory, not an oversized Binder payload. */
    static PreparedReceipt prepareReceipt(Bitmap bitmap) {
        if (bitmap == null || bitmap.isRecycled() || bitmap.isMutable()
            || bitmap.getWidth() != ReceiptRenderer.WIDTH || bitmap.getHeight() > ReceiptRenderer.MAX_HEIGHT
            || bitmap.getConfig() != Bitmap.Config.ARGB_8888
            || bitmap.getAllocationByteCount() > (long) ReceiptRenderer.WIDTH * ReceiptRenderer.MAX_HEIGHT * 4) {
            throw new IllegalArgumentException("The receipt is outside the reviewed bitmap limits.");
        }
        Parcel request = Parcel.obtain();
        Parcel feed = Parcel.obtain();
        try {
            request.writeInterfaceToken(PrinterContract.DESCRIPTOR);
            // Matches generated AIDL writeTypedObject: presence word, then Bitmap.
            request.writeInt(1);
            bitmap.writeToParcel(request, 0);
            if (request.dataSize() > 750_000 || !request.hasFileDescriptors()) {
                throw new IllegalStateException("The complete receipt could not be prepared for one bounded send.");
            }
            feed.writeInterfaceToken(PrinterContract.DESCRIPTOR);
            feed.writeInt(PrinterContract.RECEIPT_FEED_LINES);
            return new PreparedReceipt(request, feed);
        } catch (RuntimeException | OutOfMemoryError failure) {
            feed.recycle();
            request.recycle();
            throw failure;
        }
    }

    static final class PreparedReceipt implements AutoCloseable {
        private Parcel request;
        private Parcel feed;
        private boolean sent;

        private PreparedReceipt(Parcel request, Parcel feed) {
            this.request = request;
            this.feed = feed;
        }

        synchronized void send(IBinder binder, BooleanSupplier continuing) throws RemoteException {
            if (request == null || sent) throw new IllegalStateException("A receipt send cannot be repeated.");
            sent = true; // An exception can still mean paper moved: never retry this parcel.
            if (!continuing.getAsBoolean()) throw new RemoteException("Receipt dispatch was interrupted.");
            Parcel reply = Parcel.obtain();
            try {
                if (!binder.transact(PrinterContract.PRINT_BITMAP, request, reply, 0)) {
                    throw new RemoteException("Printer bitmap operation unavailable.");
                }
                reply.readException();
            } finally { reply.recycle(); }
            // White pixels are receipt layout, not a final paper-feed command.
            // Keep the fixed advance inside this same one-shot send/worker slot.
            // A timeout, pause or changed connection must not start a new IPC.
            if (!continuing.getAsBoolean()) throw new RemoteException("Receipt dispatch was interrupted.");
            Parcel feedReply = Parcel.obtain();
            try {
                if (!binder.transact(PrinterContract.NEXT_LINE, feed, feedReply, 0)) {
                    throw new RemoteException("Printer final paper-feed operation unavailable.");
                }
                feedReply.readException();
                // Both command returns still mean sent_unconfirmed, never paper proof.
            } finally { feedReply.recycle(); }
        }

        @Override public synchronized void close() {
            if (request != null) { request.recycle(); request = null; }
            if (feed != null) { feed.recycle(); feed = null; }
        }
    }
}
