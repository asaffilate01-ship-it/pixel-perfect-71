package uk.co.mealdeck.printer;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

/** Explicitly started; no reboot receiver and no automatic process restart. */
public final class ReceiptForegroundService extends Service {
    static final String PAUSE = "uk.co.mealdeck.printer.PAUSE";
    private static final String CHANNEL = "receipt-service-v1";
    private static final String ALERTS = "receipt-alerts-v1";
    private static final int NOTICE = 4101;
    private static final int ALERT = 4102;

    @Override public void onCreate() {
        super.onCreate();
        NotificationManager manager = getSystemService(NotificationManager.class);
        NotificationChannel service = new NotificationChannel(CHANNEL, "Receipt service status", NotificationManager.IMPORTANCE_LOW);
        service.setDescription("Shows when the built-in receipt printer is enabled or paused.");
        service.setSound(null, null); service.enableVibration(false);
        manager.createNotificationChannel(service);
        NotificationChannel alerts = new NotificationChannel(ALERTS, "New printed receipt", NotificationManager.IMPORTANCE_DEFAULT);
        alerts.setDescription("An alert after a receipt is sent to the built-in printer; paper still needs inspection.");
        manager.createNotificationChannel(alerts);
        Notification notification = notification("Starting the receipt service…");
        if (Build.VERSION.SDK_INT >= 34) startForeground(NOTICE, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(NOTICE, notification);
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        ReceiptRuntime runtime = ReceiptRuntime.get(this);
        if (intent != null && PAUSE.equals(intent.getAction())) {
            runtime.pauseFromService(); stopSelf();
        } else runtime.foregroundStarted(this);
        return START_NOT_STICKY;
    }

    @Override public void onDestroy() {
        ReceiptRuntime.get(this).foregroundStopped(this);
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    void update(String message) {
        getSystemService(NotificationManager.class).notify(NOTICE, notification(message));
    }

    void alert() {
        getSystemService(NotificationManager.class).notify(ALERT, new Notification.Builder(this, ALERTS)
            .setSmallIcon(android.R.drawable.ic_menu_info_details).setContentTitle("MealDeck receipt sent")
            .setContentText("Check the paper and confirm the receipt in MealDeck Printer.")
            .setContentIntent(open()).setAutoCancel(true).setCategory(Notification.CATEGORY_STATUS).build());
    }

    private PendingIntent open() {
        return PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private Notification notification(String message) {
        PendingIntent pause = PendingIntent.getService(this, 1, new Intent(this, ReceiptForegroundService.class).setAction(PAUSE), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Builder(this, CHANNEL).setSmallIcon(android.R.drawable.ic_menu_info_details)
            .setContentTitle("MealDeck Printer").setContentText(message).setContentIntent(open())
            .addAction(new Notification.Action.Builder(null, "Pause", pause).build())
            .setOnlyAlertOnce(true).setOngoing(true).setCategory(Notification.CATEGORY_SERVICE).build();
    }
}
