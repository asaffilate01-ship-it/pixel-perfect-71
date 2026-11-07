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

    static void printReceiptStrip(IBinder binder, Bitmap bitmap) throws RemoteException {
        if (bitmap == null || bitmap.getWidth() > 384 || bitmap.getHeight() > 384 ||
            bitmap.getConfig() != Bitmap.Config.ARGB_8888) {
            throw new IllegalArgumentException("The receipt strip is outside the reviewed bitmap limits.");
        }
        Parcel request = Parcel.obtain();
        Parcel reply = Parcel.obtain();
        try {
            request.writeInterfaceToken(PrinterContract.DESCRIPTOR);
            // Matches generated AIDL writeTypedObject: presence word, then Bitmap.
            request.writeInt(1);
            bitmap.writeToParcel(request, 0);
            if (request.dataSize() > 750_000) throw new IllegalStateException("The receipt strip is too large for one bounded send.");
            if (!binder.transact(PrinterContract.PRINT_BITMAP, request, reply, 0)) {
                throw new RemoteException("Printer bitmap operation unavailable.");
            }
            reply.readException();
            // This means the Binder call returned. It never proves physical paper.
        } finally {
            reply.recycle();
            request.recycle();
        }
    }
}
