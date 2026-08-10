package in.airjournal.app;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.BridgeActivity;
import java.io.File;

public class MainActivity extends BridgeActivity {

    private static final String APP_LINK_HOST = "hetu-app.vercel.app";
    private static final String TAG = "HetuMainActivity";
    private static final String NATIVE_PREFS = "hetu_native_migrations";
    private static final String SERVICE_WORKER_CLEANUP_V1 = "service_worker_cleanup_v1";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        clearLegacyServiceWorkerDataOnce();
        super.onCreate(savedInstanceState);
        openIntentRoute(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        openIntentRoute(intent);
    }

    private void clearLegacyServiceWorkerDataOnce() {
        SharedPreferences preferences = getSharedPreferences(NATIVE_PREFS, Context.MODE_PRIVATE);
        if (preferences.getBoolean(SERVICE_WORKER_CLEANUP_V1, false)) return;

        File webViewRoot = new File(getApplicationInfo().dataDir, "app_webview");
        File[] serviceWorkerDirectories = {
            new File(webViewRoot, "Default/Service Worker"),
            new File(webViewRoot, "Service Worker")
        };

        boolean cleanupSucceeded = true;
        boolean removedLegacyData = false;
        for (File directory : serviceWorkerDirectories) {
            if (!directory.exists()) continue;
            removedLegacyData = true;
            cleanupSucceeded &= deleteRecursively(directory);
        }

        if (cleanupSucceeded) {
            preferences.edit().putBoolean(SERVICE_WORKER_CLEANUP_V1, true).apply();
            if (removedLegacyData) {
                Log.i(TAG, "Removed legacy WebView service worker data.");
            }
        } else {
            Log.w(TAG, "Could not completely remove legacy WebView service worker data; will retry.");
        }
    }

    private boolean deleteRecursively(File file) {
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children == null) return false;
            for (File child : children) {
                if (!deleteRecursively(child)) return false;
            }
        }
        return !file.exists() || file.delete();
    }

    private void openIntentRoute(Intent intent) {
        String route = routeFromIntent(intent);
        if (route == null || bridge == null || bridge.getWebView() == null) return;

        String serverUrl = bridge.getServerUrl();
        if (serverUrl == null || serverUrl.isEmpty()) {
            serverUrl = bridge.getScheme() + "://" + bridge.getHost();
        }
        String destination = serverUrl.replaceAll("/$", "") + route;
        bridge.getWebView().post(() -> bridge.getWebView().loadUrl(destination));
    }

    private String routeFromIntent(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) return null;
        Uri uri = intent.getData();
        if (uri == null || uri.getScheme() == null) return null;

        String scheme = uri.getScheme();
        String route;
        if ("https".equalsIgnoreCase(scheme)) {
            if (!APP_LINK_HOST.equalsIgnoreCase(uri.getHost())) return null;
            route = uri.getEncodedPath();
        } else if ("airjournal".equalsIgnoreCase(scheme)) {
            String host = uri.getHost();
            String hostRoute = host == null || host.isEmpty() || "app".equalsIgnoreCase(host)
                ? ""
                : "/" + host;
            route = hostRoute + (uri.getEncodedPath() == null ? "" : uri.getEncodedPath());
        } else {
            return null;
        }

        if (route == null || route.isEmpty()) route = "/";
        if (uri.getEncodedQuery() != null) route += "?" + uri.getEncodedQuery();
        if (uri.getEncodedFragment() != null) route += "#" + uri.getEncodedFragment();
        return route;
    }
}
