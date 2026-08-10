package in.airjournal.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import androidx.core.app.RemoteInput;
import androidx.work.BackoffPolicy;
import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.OutOfQuotaPolicy;
import androidx.work.WorkManager;
import java.util.concurrent.TimeUnit;

/** Captures Android's inline text and hands reliable network delivery to WorkManager. */
public class BuddyReplyReceiver extends BroadcastReceiver {

    private static final int MAX_INLINE_REPLY_CHARS = 1000;

    @Override
    public void onReceive(Context context, Intent intent) {
        Bundle results = RemoteInput.getResultsFromIntent(intent);
        if (results == null) return;
        CharSequence raw = results.getCharSequence(BuddyMessagingService.REPLY_RESULT_KEY);
        String reply = raw == null ? "" : raw.toString().trim();
        if (reply.isEmpty()) return;
        if (reply.codePointCount(0, reply.length()) > MAX_INLINE_REPLY_CHARS) {
            reply = reply.substring(0, reply.offsetByCodePoints(0, MAX_INLINE_REPLY_CHARS));
        }

        String tag = intent.getStringExtra(BuddyMessagingService.EXTRA_NOTIFICATION_TAG);
        String title = intent.getStringExtra(BuddyMessagingService.EXTRA_TITLE);
        String route = intent.getStringExtra(BuddyMessagingService.EXTRA_ROUTE);
        String messageId = intent.getStringExtra(BuddyMessagingService.EXTRA_MESSAGE_ID);
        int notificationId = intent.getIntExtra(BuddyMessagingService.EXTRA_NOTIFICATION_ID, 1);

        BuddyMessagingService.showReplyState(
            context,
            tag,
            notificationId,
            title,
            route,
            context.getString(R.string.buddy_notification_sending)
        );

        Data input = new Data.Builder()
            .putString(BuddyMessagingService.EXTRA_REPLY_URL, intent.getStringExtra(BuddyMessagingService.EXTRA_REPLY_URL))
            .putString(BuddyMessagingService.EXTRA_REPLY_TOKEN, intent.getStringExtra(BuddyMessagingService.EXTRA_REPLY_TOKEN))
            .putString(BuddyMessagingService.EXTRA_REPLY_BODY, reply)
            .putString(BuddyMessagingService.EXTRA_NOTIFICATION_TAG, tag)
            .putInt(BuddyMessagingService.EXTRA_NOTIFICATION_ID, notificationId)
            .putString(BuddyMessagingService.EXTRA_TITLE, title)
            .putString(BuddyMessagingService.EXTRA_ROUTE, route)
            .build();
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(BuddyReplyWorker.class)
            .setInputData(input)
            .setConstraints(constraints)
            .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS)
            .build();
        String uniqueId = messageId == null ? tag : messageId;
        WorkManager.getInstance(context).enqueueUniqueWork(
            "buddy-inline-reply-" + uniqueId,
            ExistingWorkPolicy.KEEP,
            request
        );
    }
}
