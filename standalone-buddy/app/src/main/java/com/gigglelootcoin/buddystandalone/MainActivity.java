package com.gigglelootcoin.buddystandalone;

import android.app.Activity;
import android.os.Bundle;
import android.graphics.Color;
import android.graphics.Typeface;
import android.content.Intent;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.RecognitionListener;
import android.speech.tts.TextToSpeech;
import android.view.Gravity;
import android.view.View;
import android.view.inputmethod.InputMethodManager;
import android.content.Context;
import android.widget.*;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

public class MainActivity extends Activity {
    private static final String AI_URL = "https://buddy-free-20s07x.v2.appdeploy.ai/api/chat";
    private LinearLayout messages;
    private EditText input;
    private TextView status;
    private TextToSpeech tts;
    private SpeechRecognizer recognizer;

    @Override public void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().setStatusBarColor(Color.rgb(18,10,32));
        getWindow().setNavigationBarColor(Color.rgb(10,7,18));
        buildUi();
        tts = new TextToSpeech(this, r -> { if (r == TextToSpeech.SUCCESS) tts.setLanguage(Locale.US); });
        if (SpeechRecognizer.isRecognitionAvailable(this)) recognizer = SpeechRecognizer.createSpeechRecognizer(this);
    }

    private int dp(float n) { return (int)(n * getResources().getDisplayMetrics().density + .5f); }

    private TextView label(String text, float size, int color, boolean bold) {
        TextView v = new TextView(this);
        v.setText(text); v.setTextSize(size); v.setTextColor(color);
        if (bold) v.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return v;
    }

    private GradientDrawable bg(int color, float radius) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color); g.setCornerRadius(dp(radius)); return g;
    }

    private void buildUi() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(10,7,18));

        LinearLayout main = new LinearLayout(this);
        main.setOrientation(LinearLayout.VERTICAL);
        main.setPadding(dp(16), dp(12), dp(16), dp(10));

        TextView title = label("Little Red's Big Studio", 23, Color.WHITE, true);
        main.addView(title, new LinearLayout.LayoutParams(-1, dp(34)));

        TextView sub = label("BUDDY  •  YOUR CREATIVE STUDIO COMPANION", 11, Color.rgb(194,168,230), true);
        main.addView(sub, new LinearLayout.LayoutParams(-1, dp(24)));

        LinearLayout stage = new LinearLayout(this);
        stage.setGravity(Gravity.CENTER);
        stage.setOrientation(LinearLayout.VERTICAL);
        stage.setBackground(bg(Color.rgb(30,18,48), 28));
        stage.setPadding(dp(10), dp(16), dp(10), dp(14));

        TextView buddy = label("BUDDY", 34, Color.rgb(235,218,255), true);
        buddy.setGravity(Gravity.CENTER);
        stage.addView(buddy, new LinearLayout.LayoutParams(-1, dp(70)));

        status = label("Buddy is ready", 14, Color.rgb(210,190,235), false);
        status.setGravity(Gravity.CENTER);
        stage.addView(status, new LinearLayout.LayoutParams(-1, dp(28)));
        main.addView(stage, new LinearLayout.LayoutParams(-1, dp(130)));

        ScrollView scroll = new ScrollView(this);
        messages = new LinearLayout(this);
        messages.setOrientation(LinearLayout.VERTICAL);
        messages.setPadding(0, dp(10), 0, dp(8));
        scroll.addView(messages);
        main.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));

        LinearLayout composer = new LinearLayout(this);
        composer.setGravity(Gravity.CENTER_VERTICAL);
        composer.setPadding(0, dp(4), 0, 0);

        input = new EditText(this);
        input.setHint("Talk to Buddy…");
        input.setHintTextColor(Color.rgb(150,135,165));
        input.setTextColor(Color.WHITE);
        input.setSingleLine(true);
        input.setPadding(dp(14), 0, dp(8), 0);
        input.setBackground(bg(Color.rgb(31,22,42), 24));
        composer.addView(input, new LinearLayout.LayoutParams(0, dp(52), 1));

        Button mic = new Button(this);
        mic.setText("🎙");
        mic.setTextSize(19);
        mic.setTextColor(Color.WHITE);
        mic.setBackground(bg(Color.rgb(78,48,110), 22));
        LinearLayout.LayoutParams mp = new LinearLayout.LayoutParams(dp(54), dp(52));
        mp.setMargins(dp(6),0,dp(6),0);
        composer.addView(mic, mp);

        Button send = new Button(this);
        send.setText("➤");
        send.setTextSize(20);
        send.setTextColor(Color.WHITE);
        send.setBackground(bg(Color.rgb(122,72,168), 22));
        composer.addView(send, new LinearLayout.LayoutParams(dp(54), dp(52)));

        main.addView(composer, new LinearLayout.LayoutParams(-1, dp(56)));
        root.addView(main, new FrameLayout.LayoutParams(-1,-1));

        send.setOnClickListener(v -> sendMessage());
        input.setOnEditorActionListener((v,a,e) -> { sendMessage(); return true; });
        mic.setOnClickListener(v -> listen());
        setContentView(root);

        addBubble("Buddy", "I'm ready. Talk to me.", false);
    }

    private void addBubble(String who, String text, boolean mine) {
        TextView b = label((mine ? "You\n" : "Buddy\n") + text, 15, Color.WHITE, false);
        b.setPadding(dp(14), dp(10), dp(14), dp(10));
        b.setBackground(bg(mine ? Color.rgb(91,54,122) : Color.rgb(39,29,51), 18));
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-2, -2);
        p.setMargins(mine ? dp(44) : 0, dp(5), mine ? 0 : dp(44), dp(5));
        messages.addView(b, p);
        messages.post(() -> ((ScrollView)messages.getParent()).fullScroll(View.FOCUS_DOWN));
    }

    private void sendMessage() {
        String text = input.getText().toString().trim();
        if (text.isEmpty()) return;
        input.setText("");
        addBubble("You", text, true);
        status.setText("Buddy is thinking…");
        new Thread(() -> {
            String reply = callAi(text);
            runOnUiThread(() -> {
                if (reply == null) {
                    status.setText("Connection problem");
                    addBubble("Buddy", "I couldn't reach my AI service. Please try again.", false);
                    return;
                }
                status.setText("Buddy is speaking…");
                addBubble("Buddy", reply, false);
                speak(reply);
            });
        }).start();
    }

    private String callAi(String message) {
        HttpURLConnection c = null;
        try {
            URL u = new URL(AI_URL);
            c = (HttpURLConnection)u.openConnection();
            c.setRequestMethod("POST");
            c.setConnectTimeout(15000);
            c.setReadTimeout(30000);
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type","application/json");
            JSONObject body = new JSONObject();
            body.put("message", message);
            body.put("history", new JSONArray());
            body.put("memory", "");
            try(OutputStream out = c.getOutputStream()) {
                out.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }
            int code = c.getResponseCode();
            InputStream in = code >= 200 && code < 300 ? c.getInputStream() : c.getErrorStream();
            if (in == null) return null;
            StringBuilder s = new StringBuilder();
            try(BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
                String line; while((line=r.readLine())!=null) s.append(line);
            }
            if (code < 200 || code >= 300) return null;
            JSONObject out = new JSONObject(s.toString());
            String[] keys = {"response","reply","text","message","content"};
            for (String k: keys) if (out.has(k) && !out.isNull(k)) return out.getString(k);
            return s.toString();
        } catch(Exception e) { return null; }
        finally { if(c != null) c.disconnect(); }
    }

    private void speak(String text) {
        if (tts != null) {
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "buddy");
        }
        status.postDelayed(() -> status.setText("Buddy is ready"), Math.min(7000, Math.max(2500, text.length()*45)));
    }

    private void listen() {
        if (recognizer == null) {
            Toast.makeText(this, "Speech recognition isn't available on this phone.", Toast.LENGTH_LONG).show();
            return;
        }
        status.setText("Listening…");
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.US.toLanguageTag());
        recognizer.setRecognitionListener(new RecognitionListener() {
            public void onReadyForSpeech(Bundle b) {}
            public void onBeginningOfSpeech() {}
            public void onRmsChanged(float r) {}
            public void onBufferReceived(byte[] b) {}
            public void onEndOfSpeech() { status.setText("Buddy is thinking…"); }
            public void onError(int e) { status.setText("Buddy is ready"); }
            public void onResults(Bundle b) {
                ArrayList<String> x=b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if(x!=null && !x.isEmpty()) { input.setText(x.get(0)); sendMessage(); }
                else status.setText("Buddy is ready");
            }
            public void onPartialResults(Bundle b) {}
            public void onEvent(int a, Bundle b) {}
        });
        recognizer.startListening(i);
    }

    @Override protected void onDestroy() {
        if (recognizer != null) { recognizer.destroy(); recognizer=null; }
        if (tts != null) { tts.stop(); tts.shutdown(); tts=null; }
        super.onDestroy();
    }
}
