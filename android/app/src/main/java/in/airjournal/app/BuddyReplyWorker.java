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

/** Posts a bearer-token reply without depending on the WebView or a live login process. */
public class BuddyReplyWorker extends Worker {

    private static final int MAX_ATTEMPTS = 5;

    public BuddyReplyWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        String endpoint = getInputData().getString(BuddyMessagingService.EXTRA_REPLY_URL);
        String token = getInputData().getString(BuddyMessagingService.EXTRA_REPLY_TOKEN);
        String reply = getInputData().getString(BuddyMessagingService.EXTRA_REPLY_BODY);
        if (!validEndpoint(endpoint) || blank(token) || blank(reply)) {
            showFailure();
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
                .put("reply_token", token)
                .put("body", reply)
                .toString()
                .getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(payload.length);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(payload);
            }

            int status = connection.getResponseCode();
            if (status >= 200 && status < 300) {
                showSent(reply);
                return Result.success();
            }
            if (status >= 400 && status < 500) {
                showFailure();
                return Result.failure();
            }
        } catch (Exception ignored) {
            // WorkManager retries transient network, DNS, and server failures.
        } finally {
            if (connection != null) connection.disconnect();
        }

        if (getRunAttemptCount() + 1 < MAX_ATTEMPTS) return Result.retry();
        showFailure();
        return Result.failure();
    }

    private void showSent(String reply) {
        showState(getApplicationContext().getString(R.string.buddy_notification_sent, reply));
    }

    private void showFailure() {
        showState(getApplicationContext().getString(R.string.buddy_notification_failed));
    }

    private void showState(String text) {
        BuddyMessagingService.showReplyState(
            getApplicationContext(),
            getInputData().getString(BuddyMessagingService.EXTRA_NOTIFICATION_TAG),
            getInputData().getInt(BuddyMessagingService.EXTRA_NOTIFICATION_ID, 1),
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
