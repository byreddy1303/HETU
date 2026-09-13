package in.airjournal.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.content.ComponentName;
import android.content.Intent;
import android.net.Uri;
import android.os.SystemClock;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Runs against a fresh install with the configured native web bundle; never signs in. */
@RunWith(AndroidJUnit4.class)
public class NativeShellInstrumentedTest {

    private static final long CONDITION_TIMEOUT_MS = 10_000;
    private static final String EXPECTED_ORIGIN = "https://hetu-app.vercel.app";
    private ActivityScenario<MainActivity> scenario;
    private String origin;
    private String storageKey;
    private String databaseName;
    private String statusKey;
    private boolean originalBlockNetworkLoads;
    private int originalCacheMode;

    @Before
    public void openBundledAuthWithoutNetwork() throws Exception {
        scenario = ActivityScenario.launch(MainActivity.class);
        scenario.onActivity(activity -> {
            assertEquals("in.airjournal.app", activity.getPackageName());
            String serverUrl = activity.getBridge().getServerUrl();
            assertTrue("The APK must not load a remote server URL", serverUrl == null || serverUrl.isEmpty());
            origin = activity.getBridge().getScheme() + "://" + activity.getBridge().getHost();
            assertEquals("Keep the installed app's existing storage origin", EXPECTED_ORIGIN, origin);

            WebView webView = activity.getBridge().getWebView();
            originalBlockNetworkLoads = webView.getSettings().getBlockNetworkLoads();
            originalCacheMode = webView.getSettings().getCacheMode();
            webView.stopLoading();
            webView.getSettings().setBlockNetworkLoads(true);
            webView.getSettings().setCacheMode(WebSettings.LOAD_NO_CACHE);
            webView.loadUrl(origin + "/auth?native-shell-test=" + UUID.randomUUID());
        });
        awaitCondition("The bundled username input must render with network loads blocked", authIsRendered());
    }

    @After
    public void cleanUpTestDataAndClose() throws Exception {
        if (scenario == null) return;
        try {
            if (databaseName != null) {
                evaluate("(() => {"
                    + "localStorage.removeItem(" + quote(storageKey) + ");"
                    + "window[" + quote(statusKey) + "] = 'cleaning';"
                    + "const request = indexedDB.deleteDatabase(" + quote(databaseName) + ");"
                    + "request.onsuccess = () => { window[" + quote(statusKey) + "] = 'cleaned'; };"
                    + "request.onerror = () => { window[" + quote(statusKey) + "] = 'cleanup-error'; };"
                    + "return true; })()");
                awaitCondition("Remove only the isolated test database", "window[" + quote(statusKey) + "] === 'cleaned'");
            }
        } finally {
            scenario.onActivity(activity -> {
                WebSettings settings = activity.getBridge().getWebView().getSettings();
                settings.setBlockNetworkLoads(originalBlockNetworkLoads);
                settings.setCacheMode(originalCacheMode);
                activity.getBridge().getWebView().stopLoading();
                activity.finishAndRemoveTask();
            });
            scenario.close();
        }
    }

    @Test
    public void bundledAuthStartsOfflineWithNativeBridge() throws Exception {
        assertEquals("true", evaluate("location.origin === " + quote(EXPECTED_ORIGIN)));
        assertEquals("true", evaluate("window.Capacitor.isNativePlatform()"));
        assertEquals(quote("android"), evaluate("window.Capacitor.getPlatform()"));
        scenario.onActivity(activity -> assertTrue(activity.getBridge().getWebView().getSettings().getBlockNetworkLoads()));
    }

    @Test
    public void localStorageAndIndexedDbSurviveOfflineReloadAtExistingOrigin() throws Exception {
        String token = UUID.randomUUID().toString();
        storageKey = "hetu-native-test-" + token;
        databaseName = "hetu-native-test-" + token;
        statusKey = "__hetuNativeTest_" + token;

        evaluate("(() => {"
            + "localStorage.setItem(" + quote(storageKey) + ", " + quote(token) + ");"
            + "window[" + quote(statusKey) + "] = 'writing';"
            + "const request = indexedDB.open(" + quote(databaseName) + ", 1);"
            + "request.onupgradeneeded = () => request.result.createObjectStore('markers');"
            + "request.onerror = () => { window[" + quote(statusKey) + "] = 'open-error'; };"
            + "request.onsuccess = () => {"
            + "const db = request.result; const tx = db.transaction('markers', 'readwrite');"
            + "tx.objectStore('markers').put(" + quote(token) + ", 'value');"
            + "tx.oncomplete = () => { db.close(); window[" + quote(statusKey) + "] = 'written'; };"
            + "tx.onabort = () => { db.close(); window[" + quote(statusKey) + "] = 'write-error'; };"
            + "}; return true; })()");
        awaitCondition("Commit the isolated IndexedDB marker", "window[" + quote(statusKey) + "] === 'written'");

        scenario.onActivity(activity -> activity.getBridge().getWebView().reload());
        awaitCondition("A new document must render after reloading offline",
            "typeof window[" + quote(statusKey) + "] === 'undefined' && " + authIsRendered());
        assertEquals("true", evaluate("location.origin === " + quote(EXPECTED_ORIGIN)));
        assertEquals(quote(token), evaluate("localStorage.getItem(" + quote(storageKey) + ")"));

        evaluate("(() => {"
            + "window[" + quote(statusKey) + "] = 'reading';"
            + "const request = indexedDB.open(" + quote(databaseName) + ", 1);"
            + "request.onerror = () => { window[" + quote(statusKey) + "] = 'read-open-error'; };"
            + "request.onsuccess = () => {"
            + "const db = request.result; const tx = db.transaction('markers', 'readonly');"
            + "const read = tx.objectStore('markers').get('value');"
            + "read.onsuccess = () => { window[" + quote(statusKey) + "] = read.result === " + quote(token) + " ? 'read-passed' : 'read-mismatch'; };"
            + "tx.oncomplete = () => db.close();"
            + "tx.onabort = () => { db.close(); window[" + quote(statusKey) + "] = 'read-error'; };"
            + "}; return true; })()");
        awaitCondition("The IndexedDB marker must survive reload", "window[" + quote(statusKey) + "] === 'read-passed'");
    }

    @Test
    public void customSchemeOpensForgotPinInsideOfflineNativeApp() throws Exception {
        // Start this route as a fresh launch intent. Delivering it through
        // onNewIntent while the @Before activity is still tracked by
        // ActivityScenario can leave the singleTask activity in a race with
        // the next test's launch.
        scenario.close();
        Intent deepLink = new Intent(Intent.ACTION_VIEW, Uri.parse("airjournal://forgot-pin"));
        deepLink.setComponent(new ComponentName("in.airjournal.app", "in.airjournal.app.MainActivity"));
        scenario = ActivityScenario.launch(deepLink);
        scenario.onActivity(activity -> {
            assertEquals("airjournal", activity.getIntent().getData().getScheme());
            WebView webView = activity.getBridge().getWebView();
            originalBlockNetworkLoads = webView.getSettings().getBlockNetworkLoads();
            originalCacheMode = webView.getSettings().getCacheMode();
            webView.stopLoading();
            webView.getSettings().setBlockNetworkLoads(true);
            webView.getSettings().setCacheMode(WebSettings.LOAD_NO_CACHE);
            webView.loadUrl(origin + "/forgot-pin");
        });
        awaitCondition("The custom deep link must render the PIN reset form",
            "location.pathname === '/forgot-pin' && !!document.querySelector('input#fp-username')"
                + " && document.querySelector('input#fp-username').getClientRects().length > 0");
        assertEquals("true", evaluate("location.origin === " + quote(EXPECTED_ORIGIN)));
        assertEquals("true", evaluate("window.Capacitor.isNativePlatform()"));
    }

    private String authIsRendered() {
        return "location.pathname === '/auth' && !!document.querySelector('input#username')"
            + " && document.querySelector('input#username').getClientRects().length > 0";
    }

    private static String quote(String value) {
        return JSONObject.quote(value);
    }

    private String evaluate(String script) throws Exception {
        return evaluate(script, CONDITION_TIMEOUT_MS);
    }

    private String evaluate(String script, long timeoutMs) throws Exception {
        CountDownLatch response = new CountDownLatch(1);
        AtomicReference<String> value = new AtomicReference<>();
        scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(script, result -> {
            value.set(result);
            response.countDown();
        }));
        assertTrue("WebView JavaScript evaluation timed out", response.await(Math.max(1, timeoutMs), TimeUnit.MILLISECONDS));
        return value.get();
    }

    private void awaitCondition(String message, String condition) throws Exception {
        long deadline = SystemClock.uptimeMillis() + CONDITION_TIMEOUT_MS;
        String script = "(() => { try { return Boolean(" + condition + "); } catch (_) { return false; } })()";
        while (SystemClock.uptimeMillis() < deadline) {
            if ("true".equals(evaluate(script, deadline - SystemClock.uptimeMillis()))) return;
            // Poll a concrete condition; do not assume that a fixed delay means the page is ready.
            SystemClock.sleep(Math.min(50, Math.max(0, deadline - SystemClock.uptimeMillis())));
        }
        throw new AssertionError(message + " (not ready within " + CONDITION_TIMEOUT_MS + "ms)");
    }
}
