package in.airjournal.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final String APP_LINK_HOST = "hetu-app.vercel.app";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        openIntentRoute(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        openIntentRoute(intent);
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
