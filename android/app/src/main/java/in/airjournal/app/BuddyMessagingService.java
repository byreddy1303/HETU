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

/** Upgrades FCM alerts with HETU's notification-specific Android actions. */
public class BuddyMessagingService extends MessagingService {

    static final String CHANNEL_ID = "buddy_messages";
    static final String STUDY_CHANNEL_ID = "study_reminders";
    static final String REPLY_RESULT_KEY = "buddy_reply_text";
    static final String EXTRA_NOTIFICATION_TAG = "notification_tag";
    static final String EXTRA_NOTIFICATION_ID = "notification_id";
    static final String EXTRA_REPLY_TOKEN = "reply_token";
    static final String EXTRA_REPLY_URL = "reply_url";
    static final String EXTRA_ROUTE = "route";
    static final String EXTRA_TITLE = "title";
    static final String EXTRA_MESSAGE_ID = "message_id";
    static final String EXTRA_REPLY_BODY = "reply_body";
    static final String EXTRA_ACTION_ID = "action_id";
    static final String EXTRA_ACTION_TOKEN = "action_token";
    static final String EXTRA_ACTION_URL = "action_url";
    static final String EXTRA_CHANNEL_ID = "channel_id";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        // Keep Capacitor's pushNotificationReceived event working. The fallback
        // payload is system-rendered in the background; its foreground callback
        // is ignored because a second data payload performs the interactive draw.
        super.onMessageReceived(remoteMessage);

        Map<String, String> data = new HashMap<>(remoteMessage.getData());
        if ("fallback".equals(data.get("renderMode"))) return;
        String fallbackId = remoteMessage.getMessageId();
        if (isBlank(data.get("tagId")) && !isBlank(fallbackId)) {
            data.put("tagId", "fcm-" + fallbackId);
        }
        showIncomingNotification(getApplicationContext(), data);
    }

    static void showIncomingNotification(Context context, Map<String, String> data) {
        String channelId = safeChannel(data.get("channelId"));
        ensureChannel(context, channelId);
        String title = valueOr(data.get("title"), context.getString(R.string.app_name));
        String body = valueOr(data.get("body"), "You have a new notification.");
        String tag = valueOr(data.get("tagId"), "push-" + System.nanoTime());
        String route = safeRoute(data.get("route"));
        boolean replacesSystem = "1".equals(data.get("replaceSystemNotification"));
        int notificationId = replacesSystem ? 0 : notificationId(tag);

        NotificationCompat.Builder builder = baseBuilder(
            context,
            channelId,
            title,
            body,
            route,
            notificationId
        ).setOnlyAlertOnce(replacesSystem);

        String replyToken = data.get("replyToken");
        String replyUrl = data.get("replyUrl");
        String messageId = data.get("messageId");
        String buddyId = data.get("buddyId");
        int actionCount = 0;
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
            actionCount += 1;
        }

        for (int index = 1; index <= 3 && actionCount < 3; index += 1) {
            String actionId = data.get("action" + index + "Id");
            String label = data.get("action" + index + "Label");
            String actionType = data.get("action" + index + "Type");
            String actionRoute = safeRoute(data.get("action" + index + "Route"));
            if (isBlank(actionId) || isBlank(label)) continue;

            PendingIntent pendingIntent;
            if ("open".equals(actionType)) {
                Intent openAction = new Intent(
                    Intent.ACTION_VIEW,
                    Uri.parse("airjournal://app" + actionRoute),
                    context,
                    MainActivity.class
                ).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                pendingIntent = PendingIntent.getActivity(
                    context,
                    notificationId ^ actionId.hashCode(),
                    openAction,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                );
            } else if ("api".equals(actionType)
                && isHttps(data.get("actionUrl"))
                && !isBlank(data.get("actionToken"))) {
                Intent apiAction = new Intent(context, NotificationActionReceiver.class)
                    .setAction("in.airjournal.app.NOTIFICATION_ACTION." + actionId + "." + tag)
                    .setData(Uri.parse("airjournal-action://notification/" + Uri.encode(tag) + "/" + Uri.encode(actionId)))
                    .putExtra(EXTRA_NOTIFICATION_TAG, tag)
                    .putExtra(EXTRA_NOTIFICATION_ID, notificationId)
                    .putExtra(EXTRA_ACTION_ID, actionId)
                    .putExtra(EXTRA_ACTION_TOKEN, data.get("actionToken"))
                    .putExtra(EXTRA_ACTION_URL, data.get("actionUrl"))
                    .putExtra(EXTRA_ROUTE, route)
                    .putExtra(EXTRA_TITLE, title)
                    .putExtra(EXTRA_CHANNEL_ID, channelId);
                pendingIntent = PendingIntent.getBroadcast(
                    context,
                    notificationId ^ actionId.hashCode(),
                    apiAction,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                );
            } else {
                continue;
            }
            builder.addAction(
                new NotificationCompat.Action.Builder(R.drawable.ic_stat_hetu, label, pendingIntent)
                    .setShowsUserInterface("open".equals(actionType))
                    .build()
            );
            actionCount += 1;
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
        ensureChannel(context, CHANNEL_ID);
        NotificationCompat.Builder builder = baseBuilder(
            context,
            CHANNEL_ID,
            valueOr(title, context.getString(R.string.app_name)),
            text,
            safeRoute(route),
            notificationId
        ).setOnlyAlertOnce(true);
        NotificationManager manager =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        manager.notify(tag, notificationId, builder.build());
    }

    static void showActionState(
        Context context,
        String channelId,
        String tag,
        int notificationId,
        String title,
        String route,
        String text
    ) {
        String safeChannel = safeChannel(channelId);
        ensureChannel(context, safeChannel);
        NotificationCompat.Builder builder = baseBuilder(
            context,
            safeChannel,
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
        String channelId,
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
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.drawable.ic_stat_hetu)
            .setColor(context.getColor(R.color.colorPrimary))
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(contentIntent)
            .setAutoCancel(true)
            .setCategory(CHANNEL_ID.equals(channelId)
                ? NotificationCompat.CATEGORY_MESSAGE
                : NotificationCompat.CATEGORY_REMINDER)
            .setPriority(CHANNEL_ID.equals(channelId)
                ? NotificationCompat.PRIORITY_HIGH
                : NotificationCompat.PRIORITY_DEFAULT)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setWhen(System.currentTimeMillis())
            .setShowWhen(true);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            builder.setDefaults(NotificationCompat.DEFAULT_ALL);
        }
        return builder;
    }

    private static void ensureChannel(Context context, String channelId) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        NotificationChannel existing = manager.getNotificationChannel(channelId);
        if (existing != null) return;
        boolean buddy = CHANNEL_ID.equals(channelId);
        NotificationChannel channel = new NotificationChannel(
            channelId,
            context.getString(buddy
                ? R.string.buddy_notification_channel_name
                : R.string.study_notification_channel_name),
            buddy ? NotificationManager.IMPORTANCE_HIGH : NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.setDescription(context.getString(buddy
            ? R.string.buddy_notification_channel_description
            : R.string.study_notification_channel_description));
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

    private static String safeChannel(String channelId) {
        return STUDY_CHANNEL_ID.equals(channelId) ? STUDY_CHANNEL_ID : CHANNEL_ID;
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
