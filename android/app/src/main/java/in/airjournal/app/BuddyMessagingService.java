package in.airjournal.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.RemoteInput;
import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.HashMap;
import java.util.Map;

/** Renders foreground Android pushes and adds direct reply to Buddy messages. */
public class BuddyMessagingService extends MessagingService {

    static final String CHANNEL_ID = "buddy_messages";
    static final String REPLY_RESULT_KEY = "buddy_reply_text";
    static final String EXTRA_NOTIFICATION_TAG = "notification_tag";
    static final String EXTRA_NOTIFICATION_ID = "notification_id";
    static final String EXTRA_REPLY_TOKEN = "reply_token";
    static final String EXTRA_REPLY_URL = "reply_url";
    static final String EXTRA_ROUTE = "route";
    static final String EXTRA_TITLE = "title";
    static final String EXTRA_MESSAGE_ID = "message_id";
    static final String EXTRA_REPLY_BODY = "reply_body";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        // Keep Capacitor's pushNotificationReceived event working while the app
        // is open. FCM system-renders notification payloads only when the app is
        // backgrounded, so this foreground path does not create a duplicate.
        super.onMessageReceived(remoteMessage);

        Map<String, String> data = new HashMap<>(remoteMessage.getData());
        String fallbackId = remoteMessage.getMessageId();
        if (isBlank(data.get("tagId")) && !isBlank(fallbackId)) {
            data.put("tagId", "fcm-" + fallbackId);
        }
        showIncomingNotification(getApplicationContext(), data);
    }

    static void showIncomingNotification(Context context, Map<String, String> data) {
        ensureChannel(context);
        String title = valueOr(data.get("title"), context.getString(R.string.app_name));
        String body = valueOr(data.get("body"), "You have a new notification.");
        String tag = valueOr(data.get("tagId"), "push-" + System.nanoTime());
        String route = safeRoute(data.get("route"));
        int notificationId = notificationId(tag);

        NotificationCompat.Builder builder = baseBuilder(context, title, body, route, notificationId)
            .setOnlyAlertOnce(false);

        String replyToken = data.get("replyToken");
        String replyUrl = data.get("replyUrl");
        String messageId = data.get("messageId");
        String buddyId = data.get("buddyId");
        if (!isBlank(replyToken) && isHttps(replyUrl) && !isBlank(messageId) && !isBlank(buddyId)) {
            Intent replyIntent = new Intent(context, BuddyReplyReceiver.class)
                // PendingIntent identity ignores extras. A unique action/data
                // prevents an unlikely request-code hash collision from
                // making an older notification reply with a newer token.
                .setAction("in.airjournal.app.BUDDY_REPLY." + messageId)
                .setData(Uri.parse("airjournal-reply://message/" + messageId))
                .putExtra(EXTRA_NOTIFICATION_TAG, tag)
                .putExtra(EXTRA_NOTIFICATION_ID, notificationId)
                .putExtra(EXTRA_REPLY_TOKEN, replyToken)
                .putExtra(EXTRA_REPLY_URL, replyUrl)
                .putExtra(EXTRA_ROUTE, route)
                .putExtra(EXTRA_TITLE, title)
                .putExtra(EXTRA_MESSAGE_ID, messageId);
            PendingIntent replyPendingIntent = PendingIntent.getBroadcast(
                context,
                notificationId ^ 0x5f3759df,
                replyIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE
            );
            RemoteInput remoteInput = new RemoteInput.Builder(REPLY_RESULT_KEY)
                .setLabel(context.getString(R.string.buddy_notification_reply_hint, title))
                .setAllowFreeFormInput(true)
                .build();
            NotificationCompat.Action replyAction = new NotificationCompat.Action.Builder(
                R.drawable.ic_stat_hetu,
                context.getString(R.string.buddy_notification_reply),
                replyPendingIntent
            )
                .addRemoteInput(remoteInput)
                .setAllowGeneratedReplies(true)
                .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_REPLY)
                .setShowsUserInterface(false)
                .build();
            builder.addAction(replyAction);
        }

        NotificationManager manager =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        manager.notify(tag, notificationId, builder.build());
    }

    static void showReplyState(
        Context context,
        String tag,
        int notificationId,
        String title,
        String route,
        String text
    ) {
        ensureChannel(context);
        NotificationCompat.Builder builder = baseBuilder(
            context,
            valueOr(title, context.getString(R.string.app_name)),
            text,
            safeRoute(route),
            notificationId
        ).setOnlyAlertOnce(true);
        NotificationManager manager =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        manager.notify(tag, notificationId, builder.build());
    }

    private static NotificationCompat.Builder baseBuilder(
        Context context,
        String title,
        String body,
        String route,
        int notificationId
    ) {
        Intent openIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("airjournal://app" + route), context, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
            context,
            notificationId,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_hetu)
            .setColor(context.getColor(R.color.colorPrimary))
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(contentIntent)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setWhen(System.currentTimeMillis())
            .setShowWhen(true);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            builder.setDefaults(NotificationCompat.DEFAULT_ALL);
        }
        return builder;
    }

    private static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        NotificationChannel existing = manager.getNotificationChannel(CHANNEL_ID);
        if (existing != null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            context.getString(R.string.buddy_notification_channel_name),
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription(context.getString(R.string.buddy_notification_channel_description));
        channel.enableVibration(true);
        channel.enableLights(true);
        channel.setLightColor(Color.rgb(152, 24, 43));
        channel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PRIVATE);
        AudioAttributes audio = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .build();
        channel.setSound(android.provider.Settings.System.DEFAULT_NOTIFICATION_URI, audio);
        manager.createNotificationChannel(channel);
    }

    private static int notificationId(String tag) {
        int value = tag.hashCode() & 0x7fffffff;
        return value == 0 ? 1 : value;
    }

    private static String safeRoute(String route) {
        return !isBlank(route) && route.startsWith("/") && !route.startsWith("//") ? route : "/";
    }

    private static boolean isHttps(String value) {
        if (isBlank(value)) return false;
        try {
            Uri uri = Uri.parse(value);
            return "https".equalsIgnoreCase(uri.getScheme()) && !isBlank(uri.getHost());
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    private static boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }

    private static String valueOr(String value, String fallback) {
        return isBlank(value) ? fallback : value;
    }
}
