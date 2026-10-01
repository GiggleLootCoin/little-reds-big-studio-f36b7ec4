package com.littlered.pocketaistudio;

import android.app.Activity;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import java.util.Locale;

public class MainActivity extends Activity {
  private TextToSpeech tts;
  @Override public void onCreate(Bundle b) { super.onCreate(b);
    tts = new TextToSpeech(this, s -> { if (s == TextToSpeech.SUCCESS) tts.setLanguage(Locale.US); });
    WebView w = new WebView(this); WebSettings ws=w.getSettings(); ws.setJavaScriptEnabled(true); ws.setDomStorageEnabled(true); ws.setAllowFileAccess(true); ws.setAllowContentAccess(false); w.addJavascriptInterface(new Voice(), "NativeVoice"); w.loadUrl("file:///android_asset/index.html"); setContentView(w);
  }
  public class Voice { @JavascriptInterface public void speak(String text) { if(tts!=null) tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "pocket-ai"); } }
  @Override protected void onDestroy(){ if(tts!=null){tts.stop();tts.shutdown();} super.onDestroy(); }
}
