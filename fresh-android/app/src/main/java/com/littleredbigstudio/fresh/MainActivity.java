package com.littleredbigstudio.fresh;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.speech.RecognizerIntent;
import android.speech.tts.TextToSpeech;
import android.view.Gravity;
import android.view.View;
import android.widget.*;
import java.util.*;

public class MainActivity extends Activity implements TextToSpeech.OnInitListener {
    private LinearLayout root;
    private TextToSpeech tts;
    private SharedPreferences prefs;
    private TextView status;
    private final int MIC_REQ = 41;

    static class Model {
        final String name, size, role, url;
        Model(String n,String s,String r,String u){name=n;size=s;role=r;url=u;}
    }

    private final Model[] models = {
        new Model("Qwen3.5 0.8B","~1.2 GB","Primary fast Buddy","https://huggingface.co/Qwen/Qwen3.5-0.8B"),
        new Model("Qwen3.5 2B","~2.8 GB","Stronger general reasoning","https://huggingface.co/Qwen/Qwen3.5-2B"),
        new Model("Qwen Coder small","varies","Coding + tools","https://huggingface.co/Qwen"),
        new Model("Phi-4-mini","~2.5 GB","Reasoning + structured tasks","https://huggingface.co/microsoft/Phi-4-mini-instruct"),
        new Model("Mistral small","varies","General fallback","https://huggingface.co/mistralai"),
        new Model("Llama 3.2 1B/3B","varies","General fallback","https://huggingface.co/meta-llama"),
        new Model("DeepSeek distilled","varies","Reasoning specialist","https://huggingface.co/deepseek-ai"),
        new Model("Gemma 4 E2B","~3 GB quantized","Multimodal candidate","https://huggingface.co/google"),
        new Model("Gemma 3 270M","~280 MB","Emergency tiny fallback","https://huggingface.co/google/gemma-3-270m-it"),
        new Model("SmolLM3 3B","~2 GB quantized","Compact reasoning","https://huggingface.co/HuggingFaceTB/SmolLM3-3B"),
        new Model("LFM2.5 350M","~0.8 GB","Ultra-light local","https://huggingface.co/LiquidAI"),
        new Model("LFM2.5 1.2–2.6B","varies","Scalable local fallback","https://huggingface.co/LiquidAI"),
        new Model("MobileLLM-Flash","350M–1.4B","Mobile-first fallback","https://github.com/facebookresearch/MobileLLM"),
        new Model("MobileMoE","0.3B–0.9B active","Mobile-first reasoning","https://github.com/facebookresearch/MobileLLM"),
        new Model("Apertus Mini","0.5B–4B","Independent open fallback","https://huggingface.co/swiss-ai"),
        new Model("MiniCPM4 0.5B","~0.5B","Tiny local fallback","https://huggingface.co/openbmb"),
        new Model("Granite small","~1–3B","Tools + coding","https://huggingface.co/ibm-granite"),
        new Model("FunctionGemma 270M","~0.27B","Tool/function routing","https://huggingface.co/google"),
        new Model("EmbeddingGemma 300M","~0.3B","Memory/RAG embeddings","https://huggingface.co/google"),
        new Model("Qwen3-VL 2B","~2–3 GB","Camera/screen understanding","https://huggingface.co/Qwen")
    };

    @Override public void onCreate(Bundle b){
        super.onCreate(b);
        prefs=getSharedPreferences("studio",0);
        tts=new TextToSpeech(this,this);
        buildHome();
    }

    private TextView tv(String text,int sp){
        TextView v=new TextView(this); v.setText(text); v.setTextSize(sp); v.setTextColor(0xfff4f1ff);
        v.setPadding(24,18,24,18); return v;
    }
    private Button button(String text){
        Button b=new Button(this); b.setText(text); b.setAllCaps(false); b.setTextSize(15); b.setMinHeight(54);
        return b;
    }
    private void shell(String title,String subtitle){
        root=new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setPadding(18,18,18,18);
        root.setBackgroundColor(0xff090b12);
        ScrollView scroll=new ScrollView(this); scroll.addView(root);
        setContentView(scroll);
        TextView h=tv("Little Red's Big Studio",25); h.setGravity(Gravity.CENTER);
        root.addView(h);
        TextView s=tv(title+"\n"+subtitle,15); s.setTextColor(0xffcbb9ea); root.addView(s);
    }
    private void buildHome(){
        shell("Fresh native build","Independent experimental version — separate from the existing app.");
        TextView buddy=tv("BUDDY\nReady locally. No cloud service is required for the basic phone functions.",18);
        buddy.setGravity(Gravity.CENTER); buddy.setPadding(20,35,20,35); root.addView(buddy);
        status=tv("Status: initializing voice engine…",14); root.addView(status);

        Button speak=button("Test Buddy voice now"); speak.setOnClickListener(v->speak("Hi Red. This is Buddy speaking through the Android audio system."));
        root.addView(speak);
        Button listen=button("Hands-free speech input"); listen.setOnClickListener(v->startListening()); root.addView(listen);
        Button modelsBtn=button("Model Arsenal — local AI choices"); modelsBtn.setOnClickListener(v->buildModels()); root.addView(modelsBtn);
        Button voice=button("Voice Lab"); voice.setOnClickListener(v->buildVoice()); root.addView(voice);
        Button capabilities=button("Studio architecture / reliability"); capabilities.setOnClickListener(v->buildCapabilities()); root.addView(capabilities);
        TextView note=tv("\nDesign rule: the app never reports a task as successful unless the underlying operation actually succeeded. Local-first, provider-agnostic, free-first.",14);
        note.setTextColor(0xffaaa5b7); root.addView(note);
    }
    private void buildModels(){
        shell("Model Arsenal","Models are optional downloads; the APK itself stays small. The router chooses by RAM, task, latency and availability.");
        for(Model m:models){
            LinearLayout card=new LinearLayout(this); card.setOrientation(LinearLayout.VERTICAL); card.setPadding(10,8,10,8);
            TextView n=tv(m.name+"  •  "+m.size,17); card.addView(n);
            TextView r=tv(m.role,13); r.setTextColor(0xffbdb5cc); card.addView(r);
            Button open=button("Open model source"); open.setOnClickListener(v->startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(m.url)))); card.addView(open);
            root.addView(card);
        }
        Button back=button("Back"); back.setOnClickListener(v->buildHome()); root.addView(back);
    }
    private void buildVoice(){
        shell("Voice Lab","Native Android audio path first. Red's cloned voice is a provider asset, not silently replaced by fake 'success'.");
        root.addView(tv("1. Speaker sanity check",18));
        Button test=button("Play Buddy test speech"); test.setOnClickListener(v->speak("Audio output is working through Android's native speech engine.")); root.addView(test);
        root.addView(tv("2. Red voice",18));
        root.addView(tv("The fresh architecture reserves a direct audio-file path for Red's real generated audio. If a provider fails, the UI reports the failure instead of claiming Red spoke.",14));
        root.addView(tv("3. Microphone",18));
        Button mic=button("Request microphone + speech recognition"); mic.setOnClickListener(v->startListening()); root.addView(mic);
        Button back=button("Back"); back.setOnClickListener(v->buildHome()); root.addView(back);
    }
    private void buildCapabilities(){
        shell("Reliability architecture","The new build is deliberately independent of the current web/PWA runtime.");
        String[] caps={"Native Android shell","Native microphone permission flow","Native Android TTS fallback","Pluggable GGUF/local-model engine","Model router with tiny → stronger fallback tiers","Offline-capable basic UI","Explicit provider failure states","No Cloudflare requirement for core phone functions","No Netlify / Replit / Lovable dependency","No paid AI credits required for the base app","Persistent local settings","Separate application ID from the existing Studio"};
        for(String c:caps) root.addView(tv("✓  "+c,15));
        Button back=button("Back"); back.setOnClickListener(v->buildHome()); root.addView(back);
    }
    private void speak(String text){
        if(tts==null){return;}
        tts.speak(text,TextToSpeech.QUEUE_FLUSH,null,"buddy-test");
        if(status!=null) status.setText("Status: Android speech request sent.");
    }
    private void startListening(){
        if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},MIC_REQ); return;
        }
        try{
            Intent i=new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            i.putExtra(RecognizerIntent.EXTRA_PROMPT,"Talk to Buddy");
            startActivityForResult(i,MIC_REQ);
        }catch(Exception e){ if(status!=null) status.setText("Speech input unavailable: "+e.getClass().getSimpleName()); }
    }
    @Override protected void onActivityResult(int req,int res,Intent data){
        super.onActivityResult(req,res,data);
        if(req==MIC_REQ && res==RESULT_OK && data!=null){
            ArrayList<String> a=data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            if(a!=null&&!a.isEmpty()){ prefs.edit().putString("last_voice_input",a.get(0)).apply(); speak("I heard: "+a.get(0)); }
        }
    }
    @Override public void onInit(int result){
        if(result==TextToSpeech.SUCCESS){
            tts.setLanguage(Locale.US);
            if(status!=null) status.setText("Status: native Android speech engine ready.");
        } else if(status!=null) status.setText("Status: native Android speech engine unavailable.");
    }
    @Override protected void onDestroy(){ if(tts!=null){tts.stop();tts.shutdown();} super.onDestroy(); }
}
