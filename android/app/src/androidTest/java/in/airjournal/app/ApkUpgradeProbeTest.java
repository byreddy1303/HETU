package in.airjournal.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.os.SystemClock;
import android.util.Log;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.Assume;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Opt-in two-install probe: run with upgradePhase=seed on the previous APK, install
 * the replacement with adb install -r, then run upgradePhase=verify on the new APK.
 * The fixed test namespace lets the two instrumentation runs find only their own data.
 */
@RunWith(AndroidJUnit4.class)
public class ApkUpgradeProbeTest {

    private static final String ORIGIN = "https://hetu-app.vercel.app";
    private static final String MARKER = "hetu-instrumentation-upgrade-probe-v1";
    private static final String VALUE = "written-by-hosted-apk-before-bundled-upgrade";
    private static final String STATUS = "__hetuUpgradeProbeStatus";
    private static final long TIMEOUT_MS = 10_000;
    private ActivityScenario<MainActivity> scenario;

    @Test
    public void hostedToBundledUpgradePreservesWebViewStorage() throws Exception {
        String phase = InstrumentationRegistry.getArguments().getString("upgradePhase");
        Assume.assumeTrue("Only run explicitly with upgradePhase=seed or upgradePhase=verify",
            "seed".equals(phase) || "verify".equals(phase));
        boolean seed = "seed".equals(phase);

        try (ActivityScenario<MainActivity> launched = ActivityScenario.launch(MainActivity.class)) {
            scenario = launched;
            scenario.onActivity(activity -> {
                assertEquals("in.airjournal.app", activity.getPackageName());
                String serverUrl = activity.getBridge().getServerUrl();
                if (seed) {
                    assertEquals("Seed must exercise the previous hosted APK", ORIGIN, serverUrl);
                } else {
                    assertTrue("Verify must exercise the replacement bundled APK", serverUrl == null || serverUrl.isEmpty());
                }
                String bridgeOrigin = activity.getBridge().getScheme() + "://" + activity.getBridge().getHost();
                assertEquals(ORIGIN, bridgeOrigin);
                WebView webView = activity.getBridge().getWebView();
                webView.stopLoading();
                webView.getSettings().setBlockNetworkLoads(!seed);
                webView.getSettings().setCacheMode(WebSettings.LOAD_NO_CACHE);
                webView.loadUrl(ORIGIN + "/auth?native-upgrade-probe=" + phase);
            });
            awaitCondition("The auth form must render for the " + phase + " phase",
                "location.pathname === '/auth' && !!document.querySelector('input#username')"
                    + " && document.querySelector('input#username').getClientRects().length > 0");
            assertEquals("true", evaluate("location.origin === " + quote(ORIGIN)));
            assertEquals("true", evaluate("window.Capacitor.isNativePlatform()"));

            if (seed) {
                seedMarkers();
                Log.i("HetuUpgradeProbe", "Seed passed: committed isolated storage markers at " + ORIGIN);
            } else {
                try {
                    verifyMarkers();
                    Log.i("HetuUpgradeProbe", "Verify passed: hosted APK storage survived the bundled APK update at " + ORIGIN);
                } finally {
                    removeMarkers();
                }
            }
        }
    }

    private void seedMarkers() throws Exception {
        evaluate("(() => {"
            + "localStorage.setItem(" + quote(MARKER) + ", " + quote(VALUE) + ");"
            + "window[" + quote(STATUS) + "] = 'writing';"
            + "const request = indexedDB.open(" + quote(MARKER) + ", 1);"
            + "request.onupgradeneeded = () => request.result.createObjectStore('markers');"
            + "request.onerror = () => { window[" + quote(STATUS) + "] = 'open-error'; };"
            + "request.onsuccess = () => {"
            + "const db = request.result; const tx = db.transaction('markers', 'readwrite');"
            + "tx.objectStore('markers').put(" + quote(VALUE) + ", 'value');"
            + "tx.oncomplete = () => { db.close(); window[" + quote(STATUS) + "] = 'written'; };"
            + "tx.onabort = () => { db.close(); window[" + quote(STATUS) + "] = 'write-error'; };"
            + "}; return true; })()");
        awaitCondition("Commit the upgrade-probe IndexedDB marker", "window[" + quote(STATUS) + "] === 'written'");
        assertEquals(quote(VALUE), evaluate("localStorage.getItem(" + quote(MARKER) + ")"));
    }

    private void verifyMarkers() throws Exception {
        assertEquals("The old APK's localStorage marker must survive installation of the new APK",
            quote(VALUE), evaluate("localStorage.getItem(" + quote(MARKER) + ")"));
        evaluate("(() => {"
            + "window[" + quote(STATUS) + "] = 'reading';"
            + "const request = indexedDB.open(" + quote(MARKER) + ", 1);"
            + "request.onupgradeneeded = () => { request.transaction.abort(); window[" + quote(STATUS) + "] = 'missing-database'; };"
            + "request.onerror = () => { window[" + quote(STATUS) + "] = 'read-open-error'; };"
            + "request.onsuccess = () => {"
            + "const db = request.result; const tx = db.transaction('markers', 'readonly');"
            + "const read = tx.objectStore('markers').get('value');"
            + "read.onsuccess = () => { window[" + quote(STATUS) + "] = read.result === " + quote(VALUE) + " ? 'verified' : 'read-mismatch'; };"
            + "tx.oncomplete = () => db.close();"
            + "tx.onabort = () => { db.close(); window[" + quote(STATUS) + "] = 'read-error'; };"
            + "}; return true; })()");
        awaitCondition("The old APK's IndexedDB marker must survive installation of the new APK",
            "window[" + quote(STATUS) + "] === 'verified'");
    }

    private void removeMarkers() throws Exception {
        evaluate("(() => {"
            + "localStorage.removeItem(" + quote(MARKER) + ");"
            + "window[" + quote(STATUS) + "] = 'cleaning';"
            + "const request = indexedDB.deleteDatabase(" + quote(MARKER) + ");"
            + "request.onsuccess = () => { window[" + quote(STATUS) + "] = 'cleaned'; };"
            + "request.onerror = () => { window[" + quote(STATUS) + "] = 'cleanup-error'; };"
            + "return true; })()");
        awaitCondition("Remove the isolated upgrade-probe database", "window[" + quote(STATUS) + "] === 'cleaned'");
    }

    private static String quote(String value) {
        return JSONObject.quote(value);
    }

    private String evaluate(String script) throws Exception {
        return evaluate(script, TIMEOUT_MS);
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
        long deadline = SystemClock.uptimeMillis() + TIMEOUT_MS;
        String script = "(() => { try { return Boolean(" + condition + "); } catch (_) { return false; } })()";
        while (SystemClock.uptimeMillis() < deadline) {
            if ("true".equals(evaluate(script, deadline - SystemClock.uptimeMillis()))) return;
            SystemClock.sleep(Math.min(50, Math.max(0, deadline - SystemClock.uptimeMillis())));
        }
        throw new AssertionError(message + " (not ready within " + TIMEOUT_MS + "ms)");
    }
}
