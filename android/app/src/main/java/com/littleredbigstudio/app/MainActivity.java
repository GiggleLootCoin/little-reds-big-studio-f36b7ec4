package com.littleredbigstudio.app;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.AudioFocusRequest;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

public class MainActivity extends Activity {
    private static final String START_URL = "https://little-reds-big-studio-f36b7ec4.gigglelootcoin.workers.dev/";
    private WebView webView;
    private TextToSpeech tts;
    private AudioManager audioManager;
    private volatile boolean ttsReady = false;
    private final CountDownLatch ttsInitLatch = new CountDownLatch(1);
    private final Handler main = new Handler(Looper.getMainLooper());
    private final AudioManager.OnAudioFocusChangeListener focusListener = focusChange -> {};
    private AudioFocusRequest audioFocusRequest;

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
                        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) { wantsAudio = true; break; }
                    }
                    if (wantsAudio && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                        requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, 4101);
                    } else request.grant(request.getResources());
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
            try {
                if (status != TextToSpeech.SUCCESS) { ttsReady = false; return; }
                if (android.os.Build.VERSION.SDK_INT >= 21) {
                    tts.setAudioAttributes(new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                            .build());
                }
                int result = tts.setLanguage(Locale.US);
                tts.setSpeechRate(1.0f);
                tts.setPitch(1.0f);
                ttsReady = result != TextToSpeech.LANG_MISSING_DATA && result != TextToSpeech.LANG_NOT_SUPPORTED;
            } finally {
                ttsInitLatch.countDown();
            }
        });
    }

    private boolean speakNow(String text) {
        if (!ttsReady || tts == null || text == null || text.trim().isEmpty()) return false;
        if (!requestAudioFocus()) return false;
        if (audioManager != null && audioManager.getStreamVolume(AudioManager.STREAM_MUSIC) == 0) {
            audioManager.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_UNMUTE, 0);
        }

        final String utteranceId = "buddy-" + System.nanoTime();
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String id) {}

            @Override public void onDone(String id) {
                if (utteranceId.equals(id)) abandonAudioFocus();
            }

            @Override public void onError(String id) {
                if (utteranceId.equals(id)) abandonAudioFocus();
            }
        });

        android.os.Bundle params = new android.os.Bundle();
        params.putInt(TextToSpeech.Engine.KEY_PARAM_STREAM, AudioManager.STREAM_MUSIC);
        params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1.0f);
        params.putFloat(TextToSpeech.Engine.KEY_PARAM_PAN, 0.0f);

        // Do not wait for UtteranceProgressListener here. speakNow() runs on
        // Android's main thread, and TTS callbacks may also be delivered there.
        // Waiting here deadlocks the TTS engine before playback can start.
        final int result = tts.speak(text.trim(), TextToSpeech.QUEUE_FLUSH, params, utteranceId);
        if (result != TextToSpeech.SUCCESS) {
            abandonAudioFocus();
            return false;
        }
        return true;
    }

    private boolean requestAudioFocus() {
        if (audioManager == null) return true;
        if (Build.VERSION.SDK_INT >= 26) {
            AudioAttributes attributes = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build();
            audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                    .setAudioAttributes(attributes)
                    .setOnAudioFocusChangeListener(focusListener)
                    .setWillPauseWhenDucked(true)
                    .build();
            return audioManager.requestAudioFocus(audioFocusRequest) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        }
        return audioManager.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
    }

    private void abandonAudioFocus() {
        if (audioManager == null) return;
        if (Build.VERSION.SDK_INT >= 26 && audioFocusRequest != null) {
            audioManager.abandonAudioFocusRequest(audioFocusRequest);
        } else {
            audioManager.abandonAudioFocus(focusListener);
        }
    }

    public final class BuddyVoiceBridge {
        @JavascriptInterface public boolean isAvailable() { return ttsReady; }

        @JavascriptInterface public boolean speak(String text) {
            if (text == null || text.trim().isEmpty()) return false;
            try { ttsInitLatch.await(3000, TimeUnit.MILLISECONDS); } catch (InterruptedException e) {
                Thread.currentThread().interrupt(); return false;
            }
            if (!ttsReady) return false;

            // The JavaScript bridge is not the UI thread. Queue the actual TTS
            // call onto the main thread and return immediately. Never block the
            // main thread waiting for TTS callbacks.
            main.post(() -> speakNow(text));
            return true;
        }

        @JavascriptInterface public void stop() {
            main.post(() -> {
                if (tts != null) tts.stop();
                abandonAudioFocus();
            });
        }
    }

    @Override protected void onResume() { super.onResume(); if (webView != null) webView.onResume(); }
    @Override protected void onPause() { if (webView != null) webView.onPause(); super.onPause(); }
    @Override public void onBackPressed() { if (webView != null && webView.canGoBack()) webView.goBack(); else super.onBackPressed(); }

    @Override protected void onDestroy() {
        if (tts != null) { tts.stop(); tts.shutdown(); }
        abandonAudioFocus();
        if (webView != null) { webView.removeJavascriptInterface("AndroidBuddyVoice"); webView.destroy(); }
        super.onDestroy();
    }
}