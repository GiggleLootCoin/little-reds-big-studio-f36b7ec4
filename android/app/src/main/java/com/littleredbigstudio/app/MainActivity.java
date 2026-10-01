package com.littleredbigstudio.app;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

public class MainActivity extends Activity {
    private static final String START_URL =
            "https://little-reds-big-studio-f36b7ec4.gigglelootcoin.workers.dev/?app_build=e5931dcd83263178fc1b52dc1b65384c0539037b";

    private static final String GOOGLE_TTS = "com.google.android.tts";
    private static final String SAMSUNG_TTS = "com.samsung.SMT";
    private static final long TTS_START_TIMEOUT_MS = 8000L;

    private WebView webView;
    private TextToSpeech tts;
    private AudioManager audioManager;
    private AudioFocusRequest audioFocusRequest;
    private volatile boolean ttsReady = false;
    private volatile String activeEngine = "";
    private volatile String activeVoice = "";
    private final CountDownLatch ttsInitLatch = new CountDownLatch(1);
    private final Handler main = new Handler(Looper.getMainLooper());
    private final AudioManager.OnAudioFocusChangeListener focusListener = focusChange -> {};

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);

        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setUserAgentString(
                settings.getUserAgentString() + " LittleRedsBigStudioAndroid/NativeVoice");

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
                    if (wantsAudio &&
                            checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                                    != PackageManager.PERMISSION_GRANTED) {
                        requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, 4101);
                    } else {
                        request.grant(request.getResources());
                    }
                });
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(
                    WebView view, WebResourceRequest request) {
                return !request.getUrl().toString().startsWith(START_URL);
            }
        });

        webView.addJavascriptInterface(new BuddyVoiceBridge(), "AndroidBuddyVoice");
        setContentView(webView);
        initTts();
        webView.loadUrl(START_URL);
    }

    /**
     * Build a real, validated native TTS path.
     *
     * Preference:
     *   1. Google Speech Services
     *   2. Samsung TTS
     *   3. Any other installed engine
     *
     * Every engine is rejected unless it can provide a usable English voice.
     */
    private void initTts() {
        final List<String> candidates = new ArrayList<>();
        final Set<String> seen = new HashSet<>();

        try {
            List<TextToSpeech.EngineInfo> engines =
                    new TextToSpeech(this, status -> {}).getEngines();
        } catch (Throwable ignored) {
            // The temporary probe below is intentionally avoided if engine discovery fails.
        }

        try {
            TextToSpeech probe = new TextToSpeech(this, status -> {});
            List<TextToSpeech.EngineInfo> installed = probe.getEngines();
            probe.shutdown();

            for (String preferred : new String[]{GOOGLE_TTS, SAMSUNG_TTS}) {
                for (TextToSpeech.EngineInfo info : installed) {
                    if (preferred.equals(info.name) && seen.add(info.name)) {
                        candidates.add(info.name);
                    }
                }
            }
            for (TextToSpeech.EngineInfo info : installed) {
                if (seen.add(info.name)) candidates.add(info.name);
            }
        } catch (Throwable ignored) {
            // Fall back to Android's configured default engine.
            candidates.add(null);
        }

        if (candidates.isEmpty()) candidates.add(null);
        initTtsEngine(candidates, 0);
    }

    private void initTtsEngine(final List<String> candidates, final int index) {
        if (index >= candidates.size()) {
            ttsReady = false;
            ttsInitLatch.countDown();
            return;
        }

        final String engine = candidates.get(index);
        try {
            TextToSpeech candidate = (engine == null)
                    ? new TextToSpeech(this, status ->
                            finishTtsInitialization(candidates, index, status, candidateHolder()))
                    : new TextToSpeech(this, status ->
                            finishTtsInitialization(candidates, index, status, candidateHolder()),
                            engine);
            tts = candidate;
        } catch (Throwable error) {
            initTtsEngine(candidates, index + 1);
        }
    }

    /*
     * TextToSpeech's constructor callback can run while the candidate reference
     * is being assigned. This holder lets the callback retrieve the active
     * instance without relying on a local variable that Java requires to be final.
     */
    private TextToSpeech candidateHolder() {
        return tts;
    }

    private void finishTtsInitialization(
            List<String> candidates, int index, int status, TextToSpeech candidate) {
        if (status == TextToSpeech.SUCCESS && candidate != null && configureAndValidateTts(candidate)) {
            tts = candidate;
            ttsReady = true;
            ttsInitLatch.countDown();
            return;
        }

        if (candidate != null) {
            try { candidate.stop(); } catch (Throwable ignored) {}
            try { candidate.shutdown(); } catch (Throwable ignored) {}
        }
        tts = null;
        ttsReady = false;
        initTtsEngine(candidates, index + 1);
    }

    private boolean configureAndValidateTts(TextToSpeech engine) {
        try {
            if (Build.VERSION.SDK_INT >= 21) {
                engine.setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build());
            }

            engine.setSpeechRate(1.0f);
            engine.setPitch(1.0f);

            int result = engine.setLanguage(Locale.US);
            if (result == TextToSpeech.LANG_MISSING_DATA ||
                    result == TextToSpeech.LANG_NOT_SUPPORTED) {
                result = engine.setLanguage(Locale.UK);
            }
            if (result == TextToSpeech.LANG_MISSING_DATA ||
                    result == TextToSpeech.LANG_NOT_SUPPORTED) {
                return false;
            }

            if (Build.VERSION.SDK_INT >= 21) {
                Voice selected = chooseEnglishVoice(engine.getVoices());
                if (selected != null) {
                    int voiceResult = engine.setVoice(selected);
                    if (voiceResult != TextToSpeech.SUCCESS) return false;
                    activeVoice = selected.getName();
                }
            }

            String selectedEngine = engine.getDefaultEngine();
            activeEngine = selectedEngine == null ? "configured-default" : selectedEngine;
            return true;
        } catch (Throwable error) {
            return false;
        }
    }

    private Voice chooseEnglishVoice(Set<Voice> voices) {
        if (voices == null || voices.isEmpty()) return null;

        Voice best = null;
        int bestScore = Integer.MIN_VALUE;

        for (Voice voice : voices) {
            Locale locale = voice.getLocale();
            if (locale == null || !"en".equalsIgnoreCase(locale.getLanguage())) continue;

            int score = 0;
            if ("US".equalsIgnoreCase(locale.getCountry())) score += 100;
            else if ("GB".equalsIgnoreCase(locale.getCountry())) score += 90;
            else score += 50;

            if (Build.VERSION.SDK_INT >= 21 && !voice.isNetworkConnectionRequired()) score += 20;
            if (voice.getQuality() == Voice.QUALITY_NORMAL) score += 5;
            if (voice.getQuality() == Voice.QUALITY_HIGH) score += 10;

            if (score > bestScore) {
                bestScore = score;
                best = voice;
            }
        }
        return best;
    }

    private boolean speakNow(String text) {
        if (!ttsReady || tts == null || text == null || text.trim().isEmpty()) return false;
        if (!requestAudioFocus()) return false;

        if (audioManager != null &&
                audioManager.getStreamVolume(AudioManager.STREAM_MUSIC) == 0) {
            if (Build.VERSION.SDK_INT >= 23) {
                audioManager.adjustStreamVolume(
                        AudioManager.STREAM_MUSIC, AudioManager.ADJUST_UNMUTE, 0);
            }
        }

        final String utteranceId = "buddy-" + System.nanoTime();
        final AtomicBoolean settled = new AtomicBoolean(false);

        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String id) {
                if (utteranceId.equals(id)) settled.set(true);
            }

            @Override public void onDone(String id) {
                if (utteranceId.equals(id)) abandonAudioFocus();
            }

            @Override public void onError(String id) {
                if (utteranceId.equals(id)) abandonAudioFocus();
            }
        });

        Bundle params = new Bundle();
        params.putInt(TextToSpeech.Engine.KEY_PARAM_STREAM, AudioManager.STREAM_MUSIC);
        params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1.0f);
        params.putFloat(TextToSpeech.Engine.KEY_PARAM_PAN, 0.0f);

        int result = tts.speak(
                text.trim(), TextToSpeech.QUEUE_FLUSH, params, utteranceId);

        if (result != TextToSpeech.SUCCESS) {
            abandonAudioFocus();
            return false;
        }

        main.postDelayed(() -> {
            if (!settled.get()) abandonAudioFocus();
        }, TTS_START_TIMEOUT_MS);

        return true;
    }

    private boolean requestAudioFocus() {
        if (audioManager == null) return true;

        if (Build.VERSION.SDK_INT >= 26) {
            AudioAttributes attributes = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build();
            audioFocusRequest = new AudioFocusRequest.Builder(
                    AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                    .setAudioAttributes(attributes)
                    .setOnAudioFocusChangeListener(focusListener)
                    .setWillPauseWhenDucked(true)
                    .build();
            return audioManager.requestAudioFocus(audioFocusRequest) ==
                    AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        }

        return audioManager.requestAudioFocus(
                focusListener,
                AudioManager.STREAM_MUSIC,
                AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK) ==
                AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
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
        @JavascriptInterface public boolean isAvailable() {
            return ttsReady && tts != null;
        }

        @JavascriptInterface public String engineName() {
            return activeEngine == null ? "" : activeEngine;
        }

        @JavascriptInterface public String voiceName() {
            return activeVoice == null ? "" : activeVoice;
        }

        @JavascriptInterface public boolean speak(String text) {
            if (text == null || text.trim().isEmpty()) return false;
            if (!awaitTtsReady()) return false;

            final boolean[] result = new boolean[]{false};
            main.post(() -> result[0] = speakNow(text));
            return true;
        }

        @JavascriptInterface public void speakAsync(String text, String callbackId) {
            if (text == null || text.trim().isEmpty()) {
                notifyTtsResult(callbackId, false);
                return;
            }

            new Thread(() -> {
                if (!awaitTtsReady()) {
                    notifyTtsResult(callbackId, false);
                    return;
                }
                main.post(() -> speakNowWithCallback(text, callbackId));
            }, "buddy-tts-bridge").start();
        }

        private boolean awaitTtsReady() {
            try {
                ttsInitLatch.await(5000, TimeUnit.MILLISECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return false;
            }
            return ttsReady && tts != null;
        }

        private void speakNowWithCallback(String text, String callbackId) {
            if (!requestAudioFocus()) {
                notifyTtsResult(callbackId, false);
                return;
            }

            if (audioManager != null &&
                    audioManager.getStreamVolume(AudioManager.STREAM_MUSIC) == 0 &&
                    Build.VERSION.SDK_INT >= 23) {
                audioManager.adjustStreamVolume(
                        AudioManager.STREAM_MUSIC, AudioManager.ADJUST_UNMUTE, 0);
            }

            final String utteranceId = "buddy-" + System.nanoTime();
            final AtomicBoolean callbackSettled = new AtomicBoolean(false);

            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String id) {
                    if (utteranceId.equals(id) && callbackSettled.compareAndSet(false, true)) {
                        notifyTtsResult(callbackId, true);
                    }
                }

                @Override public void onDone(String id) {
                    if (utteranceId.equals(id)) {
                        abandonAudioFocus();
                        // Do not send false after a successful onStart.
                        // The previous implementation did exactly that after
                        // 3.5 seconds, making the UI report a working voice path
                        // as failed while audio was actually playing.
                        if (callbackSettled.compareAndSet(false, true)) {
                            notifyTtsResult(callbackId, true);
                        }
                    }
                }

                @Override public void onError(String id) {
                    if (utteranceId.equals(id)) {
                        abandonAudioFocus();
                        if (callbackSettled.compareAndSet(false, true)) {
                            notifyTtsResult(callbackId, false);
                        }
                    }
                }
            });

            Bundle params = new Bundle();
            params.putInt(TextToSpeech.Engine.KEY_PARAM_STREAM, AudioManager.STREAM_MUSIC);
            params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1.0f);
            params.putFloat(TextToSpeech.Engine.KEY_PARAM_PAN, 0.0f);

            final int result = tts.speak(
                    text.trim(), TextToSpeech.QUEUE_FLUSH, params, utteranceId);

            if (result != TextToSpeech.SUCCESS) {
                abandonAudioFocus();
                if (callbackSettled.compareAndSet(false, true)) {
                    notifyTtsResult(callbackId, false);
                }
                return;
            }

            main.postDelayed(() -> {
                if (callbackSettled.compareAndSet(false, true)) {
                    abandonAudioFocus();
                    notifyTtsResult(callbackId, false);
                }
            }, TTS_START_TIMEOUT_MS);
        }

        private void notifyTtsResult(String callbackId, boolean started) {
            if (callbackId == null || callbackId.isEmpty()) return;
            main.post(() -> {
                String safe = callbackId
                        .replace("\\", "\\\\")
                        .replace("'", "\\'");
                webView.evaluateJavascript(
                        "window.__buddyAndroidTtsResult && " +
                        "window.__buddyAndroidTtsResult('" + safe + "'," + started + ");",
                        null);
            });
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
            try { tts.stop(); } catch (Throwable ignored) {}
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