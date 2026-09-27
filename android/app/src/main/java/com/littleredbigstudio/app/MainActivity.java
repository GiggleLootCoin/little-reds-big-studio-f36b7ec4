package com.littleredbigstudio.app;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.util.ArrayDeque;
import java.util.Locale;
import java.util.Queue;

public class MainActivity extends Activity {
    private static final String START_URL = "https://little-reds-big-studio-f36b7ec4.gigglelootcoin.workers.dev/";
    private WebView webView;
    private TextToSpeech tts;
    private PermissionRequest pendingPermissionRequest;
    private boolean ttsReady = false;
    private final Queue<String> pendingSpeech = new ArrayDeque<>();
    private final Handler main = new Handler(Looper.getMainLooper());

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setUserAgentString(settings.getUserAgentString() + " LittleRedsBigStudioAndroid/NativeVoice");

        webView.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    boolean wantsAudio = false;
                    for (String resource : request.getResources()) {
                        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                            wantsAudio = true;
                            break;
                        }
                    }
                    if (wantsAudio && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                        pendingPermissionRequest = request;
                        requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, 4101);
                    } else {
                        request.grant(request.getResources());
                    }
                });
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !request.getUrl().toString().startsWith(START_URL);
            }
        });

        webView.addJavascriptInterface(new BuddyVoiceBridge(), "AndroidBuddyVoice");
        setContentView(webView);
        initTts();
        webView.loadUrl(START_URL);
    }

    private void initTts() {
        tts = new TextToSpeech(getApplicationContext(), status -> {
            if (status == TextToSpeech.SUCCESS) {
                int result = tts.setLanguage(Locale.US);
                tts.setSpeechRate(1.0f);
                tts.setPitch(1.0f);
                ttsReady = result != TextToSpeech.LANG_MISSING_DATA
                        && result != TextToSpeech.LANG_NOT_SUPPORTED;
                if (ttsReady) {
                    while (!pendingSpeech.isEmpty()) speakNow(pendingSpeech.remove());
                }
            }
        });
    }

    private void speakNow(String text) {
        if (!ttsReady || text == null || text.trim().isEmpty()) return;
        tts.speak(text.trim(), TextToSpeech.QUEUE_FLUSH, null, "buddy-" + System.nanoTime());
    }

    public final class BuddyVoiceBridge {
        @JavascriptInterface public boolean isAvailable() {
            return ttsReady || tts != null;
        }

        @JavascriptInterface public void speak(String text) {
            if (text == null || text.trim().isEmpty()) return;
            main.post(() -> {
                if (ttsReady) {
                    speakNow(text);
                } else {
                    pendingSpeech.clear();
                    pendingSpeech.add(text);
                }
            });
        }

        @JavascriptInterface public void stop() {
            main.post(() -> {
                pendingSpeech.clear();
                if (tts != null) tts.stop();
            });
        }
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == 4101 && pendingPermissionRequest != null) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                pendingPermissionRequest.grant(pendingPermissionRequest.getResources());
            } else {
                pendingPermissionRequest.deny();
            }
            pendingPermissionRequest = null;
        }
    }

    @Override protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override protected void onPause() {
        if (webView != null) webView.onPause();
        super.onPause();
    }

    @Override public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        if (tts != null) {
            tts.stop();
            tts.shutdown();
        }
        if (webView != null) {
            webView.removeJavascriptInterface("AndroidBuddyVoice");
            webView.destroy();
        }
        super.onDestroy();
    }
}
