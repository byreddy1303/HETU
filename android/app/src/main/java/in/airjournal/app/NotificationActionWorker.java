package in.airjournal.app;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/** Executes one secure notification action and replaces the alert with its state. */
public class NotificationActionWorker extends Worker {

    private static final int MAX_ATTEMPTS = 5;

    public NotificationActionWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        String endpoint = getInputData().getString(BuddyMessagingService.EXTRA_ACTION_URL);
        String token = getInputData().getString(BuddyMessagingService.EXTRA_ACTION_TOKEN);
        String action = getInputData().getString(BuddyMessagingService.EXTRA_ACTION_ID);
        if (!validEndpoint(endpoint) || blank(token) || blank(action)) {
            showState(getApplicationContext().getString(R.string.notification_action_failed));
            return Result.failure();
        }

        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(endpoint).openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(10_000);
            connection.setReadTimeout(15_000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            connection.setRequestProperty("Accept", "application/json");
            byte[] payload = new JSONObject()
                .put("action_token", token)
                .put("action", action)
                .toString()
                .getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(payload.length);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(payload);
            }

            int status = connection.getResponseCode();
            if (status >= 200 && status < 300) {
                showState(successText(action));
                return Result.success();
            }
            if (status >= 400 && status < 500) {
                showState(getApplicationContext().getString(R.string.notification_action_failed));
                return Result.failure();
            }
        } catch (Exception ignored) {
            // WorkManager retries transient network, DNS, and server failures.
        } finally {
            if (connection != null) connection.disconnect();
        }

        if (getRunAttemptCount() + 1 < MAX_ATTEMPTS) return Result.retry();
        showState(getApplicationContext().getString(R.string.notification_action_failed));
        return Result.failure();
    }

    private String successText(String action) {
        Context context = getApplicationContext();
        if ("buddy_mark_read".equals(action)) {
            return context.getString(R.string.notification_marked_read);
        }
        if ("buddy_mute_1h".equals(action)) {
            return context.getString(R.string.notification_buddy_muted);
        }
        if ("study_remind_1h".equals(action)) {
            return context.getString(R.string.notification_reminder_set);
        }
        if ("study_mute".equals(action)) {
            return context.getString(R.string.notification_category_muted);
        }
        return context.getString(R.string.notification_action_done);
    }

    private void showState(String text) {
        BuddyMessagingService.showActionState(
            getApplicationContext(),
            getInputData().getString(BuddyMessagingService.EXTRA_CHANNEL_ID),
            getInputData().getString(BuddyMessagingService.EXTRA_NOTIFICATION_TAG),
            getInputData().getInt(BuddyMessagingService.EXTRA_NOTIFICATION_ID, 0),
            getInputData().getString(BuddyMessagingService.EXTRA_TITLE),
            getInputData().getString(BuddyMessagingService.EXTRA_ROUTE),
            text
        );
    }

    private static boolean validEndpoint(String endpoint) {
        if (blank(endpoint)) return false;
        try {
            URL url = new URL(endpoint);
            return "https".equalsIgnoreCase(url.getProtocol()) && !blank(url.getHost());
        } catch (Exception ignored) {
            return false;
        }
    }

    private static boolean blank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
