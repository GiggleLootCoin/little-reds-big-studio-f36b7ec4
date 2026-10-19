package com.littleredbigstudio.app;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.SpeechRecognizer;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;

import java.io.File;
import java.io.IOException;
import java.io.FileOutputStream;
import android.util.Base64;
import java.util.ArrayList;
import android.content.Intent;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

public class MainActivity extends Activity {
    private static final String REMOTE_ORIGIN = "https://appassets.androidplatform.net";
    private static final String START_URL = REMOTE_ORIGIN + "/assets/index.html";
    // The APK carries the complete UI bundle and uses the Android app-assets HTTPS origin.
    // No Cloudflare/worker host is required for the Studio shell.
    private static final String LOCAL_START_URL = START_URL;

    private static final String GOOGLE_TTS = "com.google.android.tts";
    private static final String SAMSUNG_TTS = "com.samsung.SMT";
    private static final long TTS_START_TIMEOUT_MS = 60000L;

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
    private SpeechRecognizer speechRecognizer;
    private AudioRecord nativeRecorder;
    private volatile boolean nativeRecording = false;
    private Thread nativeRecordingThread;
    private boolean nativeListening = false;
    private PermissionRequest pendingWebPermissionRequest;
    private String pendingNativeSpeechLanguage;
    private static final String BUNDLED_ASSET_HOST = "appassets.androidplatform.net";

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);

        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setAllowContentAccess(false);
        settings.setUserAgentString(
                settings.getUserAgentString() + " LittleRedsBigStudioAndroid/NativeVoice");
        settings.setSupportMultipleWindows(false);

        webView.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    if (request == null || request.getOrigin() == null) {
                        try { if (request != null) request.deny(); } catch (Throwable ignored) {}
                        return;
                    }
                    String requestHost = request.getOrigin().getHost();
                    if (requestHost == null || !BUNDLED_ASSET_HOST.equalsIgnoreCase(requestHost)) {
                        try { request.deny(); } catch (Throwable ignored) {}
                        return;
                    }
                    boolean wantsAudio = false;
                    boolean wantsVideo = false;
                    for (String resource : request.getResources()) {
                        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) wantsAudio = true;
                        if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) wantsVideo = true;
                    }
                    ArrayList<String> missing = new ArrayList<>();
                    if (wantsAudio && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED)
                        missing.add(Manifest.permission.RECORD_AUDIO);
                    if (wantsVideo && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED)
                        missing.add(Manifest.permission.CAMERA);
                    if (!missing.isEmpty()) {
                        if (pendingWebPermissionRequest != null) {
                            try { pendingWebPermissionRequest.deny(); } catch (Throwable ignored) {}
                        }
                        pendingWebPermissionRequest = request;
                        requestPermissions(missing.toArray(new String[0]), 4101);
                    } else {
                        request.grant(request.getResources());
                    }
                });
            }
        });

        webView.setBackgroundColor(android.graphics.Color.rgb(11, 5, 6));
        webView.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(
                    WebView view, WebResourceRequest request) {
                WebResourceResponse local = serveBundledStudioAsset(request.getUrl());
                return local != null ? local : super.shouldInterceptRequest(view, request);
            }

            @Override public WebResourceResponse shouldInterceptRequest(
                    WebView view, String url) {
                WebResourceResponse local = serveBundledStudioAsset(android.net.Uri.parse(url));
                return local != null ? local : super.shouldInterceptRequest(view, url);
            }
            @Override public boolean shouldOverrideUrlLoading(
                    WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                return false;
            }

            @Override public void onReceivedError(
                    WebView view, WebResourceRequest request,
                    android.webkit.WebResourceError error) {
                if (request.isForMainFrame()) {
                    showBootError("Little Red's Big Studio could not load.\n\n" +
                            "Check your internet connection, then tap Retry.");
                }
            }

            @Override public void onReceivedHttpError(
                    WebView view, WebResourceRequest request,
                    android.webkit.WebResourceResponse errorResponse) {
                if (request.isForMainFrame()) {
                    showBootError("Little Red's Big Studio returned a loading error.\n\n" +
                            "Tap Retry to try again.");
                }
            }
        });

        webView.addJavascriptInterface(new BuddyVoiceBridge(), "AndroidBuddyVoice");
        setContentView(webView);
        initTts();
        // The Studio shell is local and HTTPS-backed. AI providers are called directly
        // from the web runtime, so the APK no longer depends on a Cloudflare worker.
        webView.loadUrl(START_URL);
    }

    private WebResourceResponse serveBundledStudioAsset(android.net.Uri uri) {
        if (uri == null || !BUNDLED_ASSET_HOST.equalsIgnoreCase(uri.getHost())) return null;
        String path = uri.getPath();
        if (path == null || path.isEmpty()) path = "/";

        // API/provider calls must stay on the real worker and are deliberately not
        // intercepted. Only the packaged HTML/JS/CSS/images are served locally.
        if (path.startsWith("/api/") || path.startsWith("/auth/") || path.startsWith("/provider/")) {
            return null;
        }

        String assetPath;
        if (path.equals("/") || !path.substring(path.lastIndexOf('/') + 1).contains(".")) {
            assetPath = "assets/index.html";
        } else if (path.startsWith("/assets/")) {
            assetPath = "assets/" + path.substring("/assets/".length());
        } else {
            // TanStack SPA routes and other extensionless paths use the bundled shell.
            assetPath = "assets/index.html";
        }

        try {
            InputStream input = getAssets().open(assetPath);
            String mime = mimeTypeFor(assetPath);
            return new WebResourceResponse(mime, "UTF-8", input);
        } catch (IOException ignored) {
            return null;
        }
    }

    private String mimeTypeFor(String path) {
        String lower = path.toLowerCase(Locale.US);
        if (lower.endsWith(".html")) return "text/html";
        if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "application/javascript";
        if (lower.endsWith(".css")) return "text/css";
        if (lower.endsWith(".json")) return "application/json";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".gif")) return "image/gif";
        if (lower.endsWith(".ico")) return "image/x-icon";
        if (lower.endsWith(".woff2")) return "font/woff2";
        if (lower.endsWith(".woff")) return "font/woff";
        if (lower.endsWith(".ttf")) return "font/ttf";
        return "application/octet-stream";
    }

    private void showBootError(String message) {
        if (webView == null) return;
        String safe = message.replace("&", "&amp;").replace("<", "&lt;")
                .replace(">", "&gt;").replace("\n", "<br>");
        String html = "<!doctype html><html><body style='margin:0;background:#0b0506;color:#fff;font-family:sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center'>" +
                "<div style='max-width:330px;padding:28px'><div style='font-size:54px'>●</div>" +
                "<h1 style='margin:10px 0;color:#ff4d61'>Little Red's Big Studio</h1>" +
                "<p style='line-height:1.5;color:#ddd'>" + safe + "</p>" +
                "<button onclick='location.reload()' style='margin-top:12px;padding:13px 24px;border:0;border-radius:24px;background:#d71932;color:white;font-weight:700'>Retry</button>" +
                "</div></body></html>";
        webView.loadDataWithBaseURL(REMOTE_ORIGIN + "/", html, "text/html", "UTF-8", REMOTE_ORIGIN + "/");
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == 4102) {
            if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED && pendingNativeSpeechLanguage != null) {
                String language = pendingNativeSpeechLanguage;
                pendingNativeSpeechLanguage = null;
                main.post(() -> startNativeListening(language));
            } else {
                pendingNativeSpeechLanguage = null;
                notifyNativeSpeechError(android.speech.SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS);
            }
            return;
        }
        if (requestCode != 4101) return;
        PermissionRequest request = pendingWebPermissionRequest;
        pendingWebPermissionRequest = null;
        if (request == null) return;
        boolean audioGranted = checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
        boolean cameraGranted = checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
        ArrayList<String> allowed = new ArrayList<>();
        for (String resource : request.getResources()) {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource) && audioGranted) allowed.add(resource);
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource) && cameraGranted) allowed.add(resource);
        }
        try {
            if (allowed.size() == request.getResources().length) request.grant(allowed.toArray(new String[0]));
            else request.deny();
        } catch (Throwable ignored) {}
    }

    private void ensureSpeechRecognizer() {
        if (speechRecognizer != null) return;
        if (!SpeechRecognizer.isRecognitionAvailable(this)) return;
        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this);
        speechRecognizer.setRecognitionListener(new RecognitionListener() {
            @Override public void onReadyForSpeech(Bundle params) {
                nativeListening = true;
                notifyNativeSpeechState("ready");
            }
            @Override public void onBeginningOfSpeech() { notifyNativeSpeechState("listening"); }
            @Override public void onRmsChanged(float rmsdB) {}
            @Override public void onBufferReceived(byte[] buffer) {}
            @Override public void onEndOfSpeech() {
                nativeListening = false;
                notifyNativeSpeechState("ended");
            }
            @Override public void onError(int error) {
                nativeListening = false;
                notifyNativeSpeechError(error);
            }
            @Override public void onResults(Bundle results) {
                nativeListening = false;
                ArrayList<String> matches = results == null
                        ? null : results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                String transcript = (matches != null && !matches.isEmpty()) ? matches.get(0) : "";
                notifyNativeSpeechResult(transcript);
            }
            @Override public void onPartialResults(Bundle partialResults) {}
            @Override public void onEvent(int eventType, Bundle params) {}
        });
    }

    private boolean startNativeListening(String language) {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            pendingNativeSpeechLanguage = language == null || language.trim().isEmpty() ? "en-US" : language;
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, 4102);
            return false;
        }
        if (!SpeechRecognizer.isRecognitionAvailable(this)) return false;
        try {
            ensureSpeechRecognizer();
            if (speechRecognizer == null) return false;
            if (nativeListening) {
                try { speechRecognizer.stopListening(); } catch (Throwable ignored) {}
            }
            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE,
                    language == null || language.trim().isEmpty() ? "en-US" : language);
            intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false);
            intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
            speechRecognizer.startListening(intent);
            nativeListening = true;
            return true;
        } catch (Throwable error) {
            nativeListening = false;
            return false;
        }
    }

    private void stopNativeListening() {
        nativeListening = false;
        if (speechRecognizer != null) {
            try { speechRecognizer.stopListening(); } catch (Throwable ignored) {}
            try { speechRecognizer.cancel(); } catch (Throwable ignored) {}
        }
    }

    private void notifyNativeSpeechState(String state) {
        main.post(() -> {
            if (webView == null) return;
            String safe = state == null ? "" : state.replace("\\", "\\\\").replace("'", "\\'");
            webView.evaluateJavascript(
                    "window.__buddyNativeSpeechState && window.__buddyNativeSpeechState('" + safe + "');",
                    null);
        });
    }

    private void notifyNativeSpeechResult(String transcript) {
        main.post(() -> {
            if (webView == null) return;
            String safe = transcript == null ? "" : transcript
                    .replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ");
            webView.evaluateJavascript(
                    "window.__buddyNativeSpeechResult && window.__buddyNativeSpeechResult('" + safe + "');",
                    null);
        });
    }

    private void notifyNativeSpeechError(int error) {
        main.post(() -> {
            if (webView == null) return;
            webView.evaluateJavascript(
                    "window.__buddyNativeSpeechError && window.__buddyNativeSpeechError(" + error + ");",
                    null);
        });
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

    private void speakDirectOrFallback(String text, String callbackId) {
        // Do not report success merely because Android accepted a TTS queue.
        // Always synthesize to a real file and confirm MediaPlayer actually
        // starts playback. This avoids the long-standing silent-speaker bug
        // where TextToSpeech.onStart fired even though no audible output was
        // reaching the device speaker.
        synthesizeAndPlay(text, callbackId);
    }

    private void fallbackToFileSynthesis(
            String text, String callbackId, AtomicBoolean fallbackStarted) {
        if (!fallbackStarted.compareAndSet(false, true)) return;
        synthesizeAndPlay(text, callbackId);
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
                    // File synthesis has started; MediaPlayer playback below is
                    // the signal returned to JavaScript.
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

                @Override public void onError(String id, int errorCode) {
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
            }, TTS_START_TIMEOUT_MS);
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

    private void playEncodedAudio(String base64, String mimeType, String callbackId) {
        if (base64 == null || base64.trim().isEmpty()) { notifyTtsResult(callbackId, false); return; }
        if (!requestAudioFocus()) { notifyTtsResult(callbackId, false); return; }
        final File output = new File(getCacheDir(), "buddy-web-audio-" + System.nanoTime() + ".bin");
        try {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            if (bytes.length == 0) throw new IOException("Empty audio payload.");
            try (FileOutputStream stream = new FileOutputStream(output)) { stream.write(bytes); }
            if (buddyPlayer != null) { try { buddyPlayer.stop(); } catch (Throwable ignored) {} try { buddyPlayer.release(); } catch (Throwable ignored) {} }
            MediaPlayer player = new MediaPlayer();
            buddyPlayer = player;
            AtomicBoolean callbackSent = new AtomicBoolean(false);
            player.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
            player.setDataSource(output.getAbsolutePath());
            player.setOnPreparedListener(mp -> {
                try { mp.start(); if (callbackSent.compareAndSet(false, true)) notifyTtsResult(callbackId, true); }
                catch (Throwable error) { failTtsPlayback(callbackId, new AtomicBoolean(false), output); }
            });
            player.setOnErrorListener((mp, what, extra) -> { failTtsPlayback(callbackId, new AtomicBoolean(false), output); return true; });
            player.setOnCompletionListener(mp -> { abandonAudioFocus(); try { mp.release(); } catch (Throwable ignored) {} if (buddyPlayer == mp) buddyPlayer = null; output.delete(); });
            player.prepareAsync();
        } catch (Throwable error) { try { output.delete(); } catch (Throwable ignored) {} abandonAudioFocus(); notifyTtsResult(callbackId, false); }
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

    private boolean startNativeAudioCapture() {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, 4103);
            return false;
        }
        if (nativeRecording) return true;
        final int sampleRate = 16000;
        final int channelConfig = AudioFormat.CHANNEL_IN_MONO;
        final int encoding = AudioFormat.ENCODING_PCM_16BIT;
        int min = AudioRecord.getMinBufferSize(sampleRate, channelConfig, encoding);
        if (min <= 0) return false;
        int bufferSize = Math.max(min * 2, sampleRate / 2);
        try {
            // CAMCORDER source is intentionally preferred on this device family:
            // it has proven more reliable than the generic MIC source on Android WebView.
            nativeRecorder = new AudioRecord(
                    MediaRecorder.AudioSource.CAMCORDER,
                    sampleRate, channelConfig, encoding, bufferSize);
            if (nativeRecorder.getState() != AudioRecord.STATE_INITIALIZED) {
                nativeRecorder.release();
                nativeRecorder = null;
                return false;
            }
            nativeRecording = true;
            nativeRecorder.startRecording();
            final AudioRecord recorder = nativeRecorder;
            nativeRecordingThread = new Thread(() -> {
                ByteArrayOutputStream pcm = new ByteArrayOutputStream();
                byte[] buffer = new byte[bufferSize];
                boolean speechStarted = false;
                long lastSpeech = System.currentTimeMillis();
                long startedAt = System.currentTimeMillis();
                try {
                    while (nativeRecording && System.currentTimeMillis() - startedAt < 20000L) {
                        int n = recorder.read(buffer, 0, buffer.length);
                        if (n <= 0) continue;
                        pcm.write(buffer, 0, n);
                        double sum = 0;
                        int samples = n / 2;
                        for (int i = 0; i + 1 < n; i += 2) {
                            int sample = (short)((buffer[i] & 0xff) | (buffer[i + 1] << 8));
                            double normalized = sample / 32768.0;
                            sum += normalized * normalized;
                        }
                        double rms = samples == 0 ? 0 : Math.sqrt(sum / samples);
                        if (rms > 0.018) {
                            speechStarted = true;
                            lastSpeech = System.currentTimeMillis();
                        } else if (speechStarted && System.currentTimeMillis() - lastSpeech >= 1200L) {
                            break;
                        }
                    }
                } catch (Throwable ignored) {
                } finally {
                    nativeRecording = false;
                    try { recorder.stop(); } catch (Throwable ignored) {}
                    try { recorder.release(); } catch (Throwable ignored) {}
                    if (nativeRecorder == recorder) nativeRecorder = null;
                    byte[] audio = makeWav(sampleRate, pcm.toByteArray());
                    String encoded = Base64.encodeToString(audio, Base64.NO_WRAP);
                    main.post(() -> notifyNativeAudioResult(encoded, "audio/wav"));
                }
            }, "buddy-native-audio");
            nativeRecordingThread.start();
            return true;
        } catch (Throwable error) {
            nativeRecording = false;
            if (nativeRecorder != null) {
                try { nativeRecorder.release(); } catch (Throwable ignored) {}
                nativeRecorder = null;
            }
            return false;
        }
    }

    private void stopNativeAudioCapture() {
        nativeRecording = false;
        AudioRecord recorder = nativeRecorder;
        if (recorder != null) {
            try { recorder.stop(); } catch (Throwable ignored) {}
        }
    }

    private byte[] makeWav(int sampleRate, byte[] pcm) {
        int dataLength = pcm == null ? 0 : pcm.length;
        byte[] wav = new byte[44 + dataLength];
        java.nio.ByteBuffer b = java.nio.ByteBuffer.wrap(wav).order(java.nio.ByteOrder.LITTLE_ENDIAN);
        b.put(new byte[]{'R','I','F','F'});
        b.putInt(36 + dataLength);
        b.put(new byte[]{'W','A','V','E','f','m','t',' '});
        b.putInt(16);
        b.putShort((short)1);
        b.putShort((short)1);
        b.putInt(sampleRate);
        b.putInt(sampleRate * 2);
        b.putShort((short)2);
        b.putShort((short)16);
        b.put(new byte[]{'d','a','t','a'});
        b.putInt(dataLength);
        if (dataLength > 0) b.put(pcm);
        return wav;
    }

    private void notifyNativeAudioResult(String base64, String mimeType) {
        if (webView == null) return;
        String safe = base64 == null ? "" : base64.replace("\\\\", "\\\\\\\\").replace("'", "\\\\'");
        String mime = mimeType == null ? "audio/wav" : mimeType.replace("'", "\\\\'");
        webView.evaluateJavascript(
                "window.__buddyNativeAudioResult && window.__buddyNativeAudioResult('" +
                safe + "','" + mime + "');", null);
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
        @JavascriptInterface public boolean nativeSpeechAvailable() {
            return SpeechRecognizer.isRecognitionAvailable(MainActivity.this);
        }

        @JavascriptInterface public boolean microphoneGranted() {
            return checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
        }

        @JavascriptInterface public boolean requestMicrophone() {
            if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) return true;
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, 4102);
            return false;
        }

        @JavascriptInterface public boolean startNativeAudioCapture() { return MainActivity.this.startNativeAudioCapture(); }

        @JavascriptInterface public void stopNativeAudioCapture() { MainActivity.this.stopNativeAudioCapture(); }

        @JavascriptInterface public boolean startNativeListening(String language) {
            return MainActivity.this.startNativeListening(language);
        }

        @JavascriptInterface public void stopNativeListening() {
            MainActivity.this.stopNativeListening();
        }

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

        @JavascriptInterface public void playBase64Async(String base64, String mimeType, String callbackId) {
            if (base64 == null || base64.trim().isEmpty()) { notifyTtsResult(callbackId, false); return; }
            main.post(() -> playEncodedAudio(base64, mimeType, callbackId));
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
                main.post(() -> speakDirectOrFallback(text, callbackId));
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
        stopNativeListening();
        stopNativeAudioCapture();
        if (speechRecognizer != null) { try { speechRecognizer.destroy(); } catch (Throwable ignored) {} speechRecognizer = null; }
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