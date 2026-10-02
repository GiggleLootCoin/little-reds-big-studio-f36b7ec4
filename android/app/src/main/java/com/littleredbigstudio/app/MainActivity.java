package com.littleredbigstudio.app;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
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

import java.io.File;
import java.io.IOException;
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
    private static final long TTS_START_TIMEOUT_MS = 20000L;

    private WebView webView;
    private TextToSpeech tts;
    private MediaPlayer buddyPlayer;
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

    private void initTts() {
        final List<String> candidates = new ArrayList<>();
        final Set<String> seen = new HashSet<>();

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
            // If engine enumeration fails, Android's configured default remains
            // the final fallback.
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

        final String engineName = candidates.get(index);
        try {
            final TextToSpeech[] holder = new TextToSpeech[1];
            TextToSpeech.OnInitListener listener = status -> {
                TextToSpeech candidate = holder[0];
                if (status == TextToSpeech.SUCCESS &&
                        candidate != null &&
                        configureAndValidateTts(candidate)) {
                    tts = candidate;
                    activeEngine = engineName == null ? candidate.getDefaultEngine() : engineName;
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
            };

            TextToSpeech candidate = engineName == null
                    ? new TextToSpeech(this, listener)
                    : new TextToSpeech(this, listener, engineName);
            holder[0] = candidate;
            tts = candidate;
        } catch (Throwable error) {
            initTtsEngine(candidates, index + 1);
        }
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
                if (selected == null) return false;
                int voiceResult = engine.setVoice(selected);
                if (voiceResult != TextToSpeech.SUCCESS) return false;
                activeVoice = selected.getName();
            }

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

            if (!voice.isNetworkConnectionRequired()) score += 20;
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
        main.post(() -> synthesizeAndPlay(text, null));
        return true;
    }

    private void synthesizeAndPlay(String text, String callbackId) {
        if (!ttsReady || tts == null || text == null || text.trim().isEmpty()) {
            notifyTtsResult(callbackId, false);
            return;
        }

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

        final String utteranceId = "buddy-file-" + System.nanoTime();
        final AtomicBoolean settled = new AtomicBoolean(false);
        final File output = new File(getCacheDir(), utteranceId + ".wav");

        try {
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String id) {
                    // Synthesis has started; this is deliberately NOT reported as
                    // successful playback. The MediaPlayer callback below is the
                    // authoritative audible-start signal.
                }

                @Override public void onDone(String id) {
                    if (!utteranceId.equals(id)) return;
                    main.post(() -> {
                        if (settled.get()) return;
                        try {
                            playSynthesizedFile(output, callbackId, settled);
                        } catch (Throwable error) {
                            failTtsPlayback(callbackId, settled, output);
                        }
                    });
                }

                @Override public void onError(String id) {
                    if (utteranceId.equals(id)) {
                        main.post(() -> failTtsPlayback(callbackId, settled, output));
                    }
                }
            });

            Bundle params = new Bundle();
            params.putInt(TextToSpeech.Engine.KEY_PARAM_STREAM, AudioManager.STREAM_MUSIC);
            params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1.0f);
            params.putFloat(TextToSpeech.Engine.KEY_PARAM_PAN, 0.0f);

            int result = tts.synthesizeToFile(
                    text.trim(), params, output, utteranceId);

            if (result != TextToSpeech.SUCCESS) {
                failTtsPlayback(callbackId, settled, output);
                return;
            }

            main.postDelayed(() -> {
                if (!settled.get()) failTtsPlayback(callbackId, settled, output);
            }, 20000L);
        } catch (Throwable error) {
            failTtsPlayback(callbackId, settled, output);
        }
    }

    private void playSynthesizedFile(
            File output, String callbackId, AtomicBoolean settled) {
        if (!output.exists() || output.length() == 0) {
            failTtsPlayback(callbackId, settled, output);
            return;
        }

        try {
            if (buddyPlayer != null) {
                try { buddyPlayer.stop(); } catch (Throwable ignored) {}
                try { buddyPlayer.release(); } catch (Throwable ignored) {}
            }

            MediaPlayer player = new MediaPlayer();
            buddyPlayer = player;
            AtomicBoolean callbackSent = new AtomicBoolean(false);
            player.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build());
            player.setDataSource(output.getAbsolutePath());
            player.setOnPreparedListener(mp -> {
                try {
                    mp.start();
                    if (callbackId != null && callbackSent.compareAndSet(false, true)) {
                        notifyTtsResult(callbackId, true);
                    }
                } catch (Throwable error) {
                    failTtsPlayback(callbackId, settled, output);
                }
            });
            player.setOnErrorListener((mp, what, extra) -> {
                failTtsPlayback(callbackId, settled, output);
                return true;
            });
            player.setOnCompletionListener(mp -> {
                if (settled.compareAndSet(false, true)) {
                    abandonAudioFocus();
                    try { mp.release(); } catch (Throwable ignored) {}
                    if (buddyPlayer == mp) buddyPlayer = null;
                    //noinspection ResultOfMethodCallIgnored
                    output.delete();
                }
            });
            player.prepareAsync();
        } catch (IOException | IllegalStateException error) {
            failTtsPlayback(callbackId, settled, output);
        }
    }

    private void failTtsPlayback(
            String callbackId, AtomicBoolean settled, File output) {
        if (!settled.compareAndSet(false, true)) return;
        abandonAudioFocus();
        if (buddyPlayer != null) {
            try { buddyPlayer.reset(); } catch (Throwable ignored) {}
            try { buddyPlayer.release(); } catch (Throwable ignored) {}
            buddyPlayer = null;
        }
        //noinspection ResultOfMethodCallIgnored
        output.delete();
        if (callbackId != null) notifyTtsResult(callbackId, false);
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
            main.post(() -> speakNow(text));
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
                main.post(() -> synthesizeAndPlay(text, callbackId));
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
                if (buddyPlayer != null) {
                    try { buddyPlayer.stop(); } catch (Throwable ignored) {}
                    try { buddyPlayer.release(); } catch (Throwable ignored) {}
                    buddyPlayer = null;
                }
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
        if (buddyPlayer != null) {
            try { buddyPlayer.stop(); } catch (Throwable ignored) {}
            try { buddyPlayer.release(); } catch (Throwable ignored) {}
            buddyPlayer = null;
        }
        abandonAudioFocus();
        if (webView != null) {
            webView.removeJavascriptInterface("AndroidBuddyVoice");
            webView.destroy();
        }
        super.onDestroy();
    }
}