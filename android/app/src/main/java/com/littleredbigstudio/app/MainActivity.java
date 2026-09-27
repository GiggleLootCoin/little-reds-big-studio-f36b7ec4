package com.littleredbigstudio.app;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.AudioManager;
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
import java.util.Locale;

public class MainActivity extends Activity {
    private static final String START_URL = "https://little-reds-big-studio-f36b7ec4.gigglelootcoin.workers.dev/";
    private WebView webView;
    private TextToSpeech tts;
    private AudioManager audioManager;
    private boolean ttsReady = false;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final AudioManager.OnAudioFocusChangeListener focusListener = focusChange -> {};

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
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
            if (status != TextToSpeech.SUCCESS) {
                ttsReady = false;
                return;
            }
            int result = tts.setLanguage(Locale.US);
            tts.setSpeechRate(1.0f);
            tts.setPitch(1.0f);
            if (android.os.Build.VERSION.SDK_INT >= 21) {
                tts.setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ASSISTANCE_ACCESSIBILITY)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build());
            }
            ttsReady = result != TextToSpeech.LANG_MISSING_DATA
                    && result != TextToSpeech.LANG_NOT_SUPPORTED;
        });
    }

    private boolean requestAudioFocus() {
        if (audioManager == null) return true;
        int result = audioManager.requestAudioFocus(
                focusListener,
                AudioManager.STREAM_MUSIC,
                AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK);
        return result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
    }

    private void abandonAudioFocus() {
        if (audioManager != null) audioManager.abandonAudioFocus(focusListener);
    }

    private boolean speakNow(String text) {
        if (!ttsReady || tts == null || text == null || text.trim().isEmpty()) return false;
        if (!requestAudioFocus()) return false;
        int result = tts.speak(text.trim(), TextToSpeech.QUEUE_FLUSH, null, "buddy-" + System.nanoTime());
        if (result != TextToSpeech.SUCCESS) {
            abandonAudioFocus();
            return false;
        }
        return true;
    }

    public final class BuddyVoiceBridge {
        @JavascriptInterface public boolean isAvailable() {
            return ttsReady;
        }

        @JavascriptInterface public boolean speak(String text) {
            if (text == null || text.trim().isEmpty()) return false;
            final boolean[] result = {false};
            main.post(() -> result[0] = speakNow(text));
            // The bridge call itself is synchronous from JavaScript, but Android
            // dispatches @JavascriptInterface work off the UI thread. Post the
            // actual TTS call and report availability separately; JS only treats
            // a ready engine as the native route.
            return ttsReady;
        }

        @JavascriptInterface public void stop() {
            main.post(() -> {
                if (tts != null) tts.stop();
                abandonAudioFocus();
            });
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
        abandonAudioFocus();
        if (webView != null) {
            webView.removeJavascriptInterface("AndroidBuddyVoice");
            webView.destroy();
        }
        super.onDestroy();
    }
}
