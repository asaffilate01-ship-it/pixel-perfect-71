package uk.co.mealdeck.printer;

import android.graphics.Bitmap;
import android.os.IBinder;
import android.os.Parcel;
import android.os.RemoteException;

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
        try {
            request.writeInterfaceToken(PrinterContract.DESCRIPTOR);
            // Matches generated AIDL writeTypedObject: presence word, then Bitmap.
            request.writeInt(1);
            bitmap.writeToParcel(request, 0);
            if (request.dataSize() > 750_000 || !request.hasFileDescriptors()) {
                throw new IllegalStateException("The complete receipt could not be prepared for one bounded send.");
            }
            return new PreparedReceipt(request);
        } catch (RuntimeException | OutOfMemoryError failure) {
            request.recycle();
            throw failure;
        }
    }

    static final class PreparedReceipt implements AutoCloseable {
        private Parcel request;
        private boolean sent;

        private PreparedReceipt(Parcel request) { this.request = request; }

        synchronized void send(IBinder binder) throws RemoteException {
            if (request == null || sent) throw new IllegalStateException("A receipt send cannot be repeated.");
            sent = true; // An exception can still mean paper moved: never retry this parcel.
            Parcel reply = Parcel.obtain();
            try {
                if (!binder.transact(PrinterContract.PRINT_BITMAP, request, reply, 0)) {
                    throw new RemoteException("Printer bitmap operation unavailable.");
                }
                reply.readException();
                // A returned Binder call never proves physical paper.
            } finally { reply.recycle(); }
        }

        @Override public synchronized void close() {
            if (request != null) { request.recycle(); request = null; }
        }
    }
}
