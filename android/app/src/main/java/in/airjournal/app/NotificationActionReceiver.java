package in.airjournal.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import androidx.work.BackoffPolicy;
import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.OutOfQuotaPolicy;
import androidx.work.WorkManager;
import java.util.concurrent.TimeUnit;

/** Queues token-authenticated notification buttons without opening the app. */
public class NotificationActionReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        String actionId = intent.getStringExtra(BuddyMessagingService.EXTRA_ACTION_ID);
        String actionToken = intent.getStringExtra(BuddyMessagingService.EXTRA_ACTION_TOKEN);
        String actionUrl = intent.getStringExtra(BuddyMessagingService.EXTRA_ACTION_URL);
        if (blank(actionId) || blank(actionToken) || blank(actionUrl)) return;

        String tag = intent.getStringExtra(BuddyMessagingService.EXTRA_NOTIFICATION_TAG);
        int notificationId = intent.getIntExtra(BuddyMessagingService.EXTRA_NOTIFICATION_ID, 0);
        String title = intent.getStringExtra(BuddyMessagingService.EXTRA_TITLE);
        String route = intent.getStringExtra(BuddyMessagingService.EXTRA_ROUTE);
        String channelId = intent.getStringExtra(BuddyMessagingService.EXTRA_CHANNEL_ID);
        BuddyMessagingService.showActionState(
            context,
            channelId,
            tag,
            notificationId,
            title,
            route,
            context.getString(R.string.notification_action_working)
        );

        Data input = new Data.Builder()
            .putString(BuddyMessagingService.EXTRA_ACTION_ID, actionId)
            .putString(BuddyMessagingService.EXTRA_ACTION_TOKEN, actionToken)
            .putString(BuddyMessagingService.EXTRA_ACTION_URL, actionUrl)
            .putString(BuddyMessagingService.EXTRA_NOTIFICATION_TAG, tag)
            .putInt(BuddyMessagingService.EXTRA_NOTIFICATION_ID, notificationId)
            .putString(BuddyMessagingService.EXTRA_TITLE, title)
            .putString(BuddyMessagingService.EXTRA_ROUTE, route)
            .putString(BuddyMessagingService.EXTRA_CHANNEL_ID, channelId)
            .build();
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(NotificationActionWorker.class)
            .setInputData(input)
            .setConstraints(constraints)
            .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS)
            .build();
        WorkManager.getInstance(context).enqueueUniqueWork(
            "notification-action-" + tag + "-" + actionId,
            ExistingWorkPolicy.KEEP,
            request
        );
    }

    private static boolean blank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
