package com.littleredbigstudio.next;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.*;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.speech.*;
import android.speech.tts.*;
import android.view.*;
import android.widget.*;
import org.json.*;
import java.io.*;
import java.net.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import android.speech.tts.UtteranceProgressListener;

public class MainActivity extends Activity {
  final int PINK=Color.rgb(255,79,163),BG=Color.rgb(8,10,18),CARD=Color.rgb(20,23,34),TEXT=Color.rgb(244,246,252),MUTED=Color.rgb(156,164,183);
  SharedPreferences prefs; TextToSpeech tts; SpeechRecognizer recognizer; ExecutorService io=Executors.newSingleThreadExecutor();
  TextView status,response,modelLabel,voiceLabel; EditText input; Switch handsFree; boolean listening=false; AudioManager audioManager;
  final Handler mainHandler=new Handler(Looper.getMainLooper()); AtomicBoolean requestInFlight=new AtomicBoolean(false); long requestStartedAt=0; Runnable elapsedTicker; ArrayList<String> ttsEngines=new ArrayList<>(); int ttsEngineIndex=-1;
  String endpoint,model,selectedVoiceName="";
  String[] MODELS={"Auto / installed model","Qwen3.5-0.8B Q4_K_M","Qwen3.5-4B","Qwen3.5-8B","Phi-4-mini","Mistral 7B","Llama 3.2 3B","Llama 3.1 8B","DeepSeek-R1 1.5B","DeepSeek-R1 7B","Gemma 3 1B","Gemma 3 4B","SmolLM2 1.7B","Granite 4","Ministral 3B","Nemotron Mini"};

  @Override public void onCreate(Bundle b){
    super.onCreate(b); audioManager=(AudioManager)getSystemService(AUDIO_SERVICE); setVolumeControlStream(AudioManager.STREAM_MUSIC); prefs=getSharedPreferences("studio",0);
    endpoint=prefs.getString("endpoint","http://127.0.0.1:11434/v1/chat/completions");
    model=prefs.getString("model","Auto / installed model"); selectedVoiceName=prefs.getString("voice","");
    buildUi(); initTts(); initSpeech();
    if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},42);
  }
  TextView tv(String s,float sp,int c){TextView v=new TextView(this);v.setText(s);v.setTextSize(sp);v.setTextColor(c);v.setGravity(Gravity.CENTER_VERTICAL);return v;}
  GradientDrawable bg(int c,float r){GradientDrawable g=new GradientDrawable();g.setColor(c);g.setCornerRadius(r);return g;}
  Button button(String s){Button b=new Button(this);b.setText(s);b.setTextColor(TEXT);b.setTextSize(14);b.setAllCaps(false);b.setBackground(bg(Color.rgb(31,35,50),28));return b;}
  LinearLayout card(){LinearLayout l=new LinearLayout(this);l.setOrientation(LinearLayout.VERTICAL);l.setPadding(16,14,16,14);l.setBackground(bg(CARD,30));LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.setMargins(0,0,0,14);l.setLayoutParams(p);return l;}

  void buildUi(){
    LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setPadding(18,18,18,12);root.setBackgroundColor(BG);
    LinearLayout head=new LinearLayout(this);head.setGravity(Gravity.CENTER_VERTICAL);
    TextView logo=tv("✦",38,PINK);logo.setTypeface(null,1);head.addView(logo,new LinearLayout.LayoutParams(52,58));
    LinearLayout titles=new LinearLayout(this);titles.setOrientation(LinearLayout.VERTICAL);titles.addView(tv("LITTLE RED'S",18,TEXT));titles.addView(tv("BIG STUDIO",24,PINK));head.addView(titles,new LinearLayout.LayoutParams(0,58,1));
    TextView gear=tv("⚙",26,TEXT);gear.setGravity(Gravity.CENTER);head.addView(gear,new LinearLayout.LayoutParams(52,58));gear.setOnClickListener(v->settings());root.addView(head);
    status=tv("●  Ready — local-first",13,Color.rgb(101,231,164));status.setPadding(4,4,4,10);root.addView(status);
    ScrollView scroll=new ScrollView(this);LinearLayout body=new LinearLayout(this);body.setOrientation(LinearLayout.VERTICAL);

    LinearLayout ai=card();TextView ah=tv("AI BRAIN",13,PINK);ah.setTypeface(null,1);ai.addView(ah);
    modelLabel=tv("Model: "+model,15,TEXT);modelLabel.setPadding(0,10,0,10);ai.addView(modelLabel);
    Button cm=button("Choose model");ai.addView(cm,new LinearLayout.LayoutParams(-1,48));cm.setOnClickListener(v->chooseModel());body.addView(ai);

    LinearLayout vc=card();TextView vh=tv("VOICE + HANDS-FREE",13,PINK);vh.setTypeface(null,1);vc.addView(vh);
    voiceLabel=tv("Voice: Android TTS — initializing…",15,TEXT);voiceLabel.setPadding(0,10,0,6);vc.addView(voiceLabel);
    LinearLayout vr=new LinearLayout(this);Button cv=button("Voices");Button test=button("Test voice");vr.addView(cv,new LinearLayout.LayoutParams(0,48,1));vr.addView(test,new LinearLayout.LayoutParams(0,48,1));vc.addView(vr);
    cv.setOnClickListener(v->chooseVoice());test.setOnClickListener(v->speak("Hi Red. This is the voice path test from Little Red's Big Studio."));
    LinearLayout hr=new LinearLayout(this);hr.setGravity(Gravity.CENTER_VERTICAL);hr.addView(tv("Hands-free conversation",14,TEXT),new LinearLayout.LayoutParams(0,50,1));handsFree=new Switch(this);handsFree.setChecked(prefs.getBoolean("handsFree",false));hr.addView(handsFree);vc.addView(hr);handsFree.setOnCheckedChangeListener((v,c)->prefs.edit().putBoolean("handsFree",c).apply());body.addView(vc);

    LinearLayout chat=card();TextView ch=tv("CHAT",13,PINK);ch.setTypeface(null,1);chat.addView(ch);
    response=tv("Little Red's Big Studio is ready. PocketPal can be used directly on this phone through localhost:11434.",14,TEXT);response.setPadding(0,12,0,12);chat.addView(response);
    input=new EditText(this);input.setHint("Say something...");input.setHintTextColor(MUTED);input.setTextColor(TEXT);input.setTextSize(16);input.setMinHeight(58);input.setPadding(16,8,16,8);input.setBackground(bg(Color.rgb(14,17,27),22));chat.addView(input,new LinearLayout.LayoutParams(-1,70));
    LinearLayout actions=new LinearLayout(this);actions.setPadding(0,10,0,0);Button mic=button("Speak");Button send=button("Send");actions.addView(mic,new LinearLayout.LayoutParams(0,52,1));actions.addView(send,new LinearLayout.LayoutParams(0,52,1));chat.addView(actions);mic.setOnClickListener(v->listen());send.setOnClickListener(v->sendText());body.addView(chat);
    TextView foot=tv("Local-first | native Android audio | model-agnostic | no Cloudflare dependency",11,MUTED);foot.setPadding(6,14,6,20);body.addView(foot);scroll.addView(body);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);
  }

  void initTts(){
    voiceLabel.setText("Voice: Android TTS — initializing…");
    tts=new TextToSpeech(this,code->{
      if(code==TextToSpeech.SUCCESS){
        configureTts("default");
      }else{
        voiceLabel.setText("Voice: Android TTS unavailable"); status.setText("●  No working TTS engine");
      }
    });
  }
  void configureTts(String engine){
    if(tts==null)return;
    try{
      tts.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANT).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
      int lang=tts.setLanguage(Locale.US);
      if(lang==TextToSpeech.LANG_MISSING_DATA||lang==TextToSpeech.LANG_NOT_SUPPORTED){
        fallbackTtsEngine(); return;
      }
      tts.setSpeechRate(0.98f); tts.setPitch(1.0f);
      if(!selectedVoiceName.isEmpty()) for(Voice v:tts.getVoices()) if(v.getName().equals(selectedVoiceName)){tts.setVoice(v);break;}
      tts.setOnUtteranceProgressListener(new UtteranceProgressListener(){
        public void onStart(String id){runOnUiThread(()->status.setText("●  Speaking"));
        }
        public void onDone(String id){runOnUiThread(()->{status.setText("●  Ready");if(handsFree!=null&&handsFree.isChecked())mainHandler.postDelayed(()->listen(),450);});}
        public void onError(String id){runOnUiThread(()->status.setText("●  Voice error — try another engine/voice"));
        }
      });
      String engineName=tts.getDefaultEngine();
      voiceLabel.setText("Voice: "+(engineName==null?"Android TTS":engineName)+" — ready");
      status.setText("●  Ready");
    }catch(Exception e){fallbackTtsEngine();}
  }
  void fallbackTtsEngine(){
    try{
      if(tts!=null){
        List<TextToSpeech.EngineInfo> engines=tts.getEngines();
        ttsEngines.clear();
        for(TextToSpeech.EngineInfo e:engines) if(e!=null&&e.name!=null) ttsEngines.add(e.name);
        String[] preferred={"com.samsung.SMT","com.google.android.tts"};
        String next=null;
        for(String p:preferred) if(ttsEngines.contains(p)){next=p;break;}
        if(next==null&&!ttsEngines.isEmpty()) next=ttsEngines.get(0);
        tts.shutdown(); tts=null;
        if(next!=null){
          final String chosen=next;
          tts=new TextToSpeech(this,code->{if(code==TextToSpeech.SUCCESS)configureTts(chosen);else {voiceLabel.setText("Voice: no compatible TTS engine");status.setText("●  Voice engine failed");}},chosen);
          return;
        }
      }
    }catch(Exception ignored){}
    voiceLabel.setText("Voice: no compatible TTS engine"); status.setText("●  Install/enable Samsung TTS or Google Speech Services");
  }

  void initSpeech(){if(!SpeechRecognizer.isRecognitionAvailable(this))return;recognizer=SpeechRecognizer.createSpeechRecognizer(this);recognizer.setRecognitionListener(new RecognitionListener(){
    public void onReadyForSpeech(Bundle p){runOnUiThread(()->{listening=true;status.setText("●  Listening...");});}
    public void onBeginningOfSpeech(){} public void onRmsChanged(float r){} public void onBufferReceived(byte[] b){}
    public void onEndOfSpeech(){runOnUiThread(()->status.setText("●  Processing voice..."));}
    public void onError(int e){runOnUiThread(()->{listening=false;status.setText("●  Ready");});}
    public void onResults(Bundle b){ArrayList<String> r=b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);if(r!=null&&!r.isEmpty()){input.setText(r.get(0));sendText();}}
    public void onPartialResults(Bundle b){} public void onEvent(int a,Bundle b){} });}

  void listen(){if(recognizer==null){toast("Speech recognition is not available.");return;}if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},42);return;}if(listening){recognizer.cancel();listening=false;return;}Intent i=new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);i.putExtra(RecognizerIntent.EXTRA_LANGUAGE,Locale.US.toLanguageTag());recognizer.startListening(i);}

  void sendText(){
    String prompt=input.getText().toString().trim(); if(prompt.isEmpty())return;
    if(!requestInFlight.compareAndSet(false,true)){status.setText("●  Already processing — please wait");return;}
    input.setText(""); response.setText(""); requestStartedAt=SystemClock.elapsedRealtime(); status.setText("●  Connecting to AI…");
    elapsedTicker=new Runnable(){public void run(){if(requestInFlight.get()){long s=(SystemClock.elapsedRealtime()-requestStartedAt)/1000;status.setText("●  AI thinking… "+s+"s");mainHandler.postDelayed(this,1000);}}}; mainHandler.post(elapsedTicker);
    io.execute(()->{try{String reply=callModelStreaming(prompt,model);runOnUiThread(()->{response.setText(reply);speak(reply);finishRequest();});}catch(Exception e){runOnUiThread(()->{response.setText("AI connection failed: "+safeMessage(e));status.setText("●  AI connection needs attention");finishRequest();});}});
  }
  void finishRequest(){requestInFlight.set(false);if(elapsedTicker!=null)mainHandler.removeCallbacks(elapsedTicker);}
  String safeMessage(Exception e){String m=e.getMessage();return m==null?e.getClass().getSimpleName():m;}

  String callModelStreaming(String prompt,String chosen)throws Exception{
    URL u=new URL(endpoint);HttpURLConnection c=(HttpURLConnection)u.openConnection();c.setConnectTimeout(3500);c.setReadTimeout(30000);c.setRequestMethod("POST");c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json");
    String m=chosen.equals("Auto / installed model")?"qwen3.5:0.8b":chosen.replace(" Q4_K_M","").replace(" ","-").toLowerCase(Locale.US);boolean ollama=endpoint.contains("/api/chat");
    JSONObject body=new JSONObject();body.put("model",m);body.put("stream",true);JSONArray msgs=new JSONArray();JSONObject usr=new JSONObject();usr.put("role","user");usr.put("content",prompt);msgs.put(usr);body.put("messages",msgs);
    c.setRequestProperty("Accept","text/event-stream");
    OutputStream os=c.getOutputStream();os.write(body.toString().getBytes("UTF-8"));os.close();
    int code=c.getResponseCode();InputStream in=code>=200&&code<300?c.getInputStream():c.getErrorStream();
    if(code<200||code>=300){String raw=read(in);c.disconnect();throw new Exception("HTTP "+code+": "+raw);}
    BufferedReader r=new BufferedReader(new InputStreamReader(in,"UTF-8")); StringBuilder out=new StringBuilder(); String line;
    while((line=r.readLine())!=null){
      String data=line.startsWith("data:")?line.substring(5).trim():line.trim(); if(data.isEmpty()||data.equals("[DONE]"))continue;
      try{JSONObject j=new JSONObject(data);String piece="";if(ollama){JSONObject msg=j.optJSONObject("message");if(msg!=null)piece=msg.optString("content","");}else{JSONArray choices=j.optJSONArray("choices");if(choices!=null&&choices.length()>0){JSONObject delta=choices.getJSONObject(0).optJSONObject("delta");if(delta!=null)piece=delta.optString("content","");}}
        if(!piece.isEmpty()){out.append(piece);String shown=out.toString();mainHandler.post(()->{response.setText(shown);response.setSelection(response.getText().length());});}
      }catch(JSONException ignored){}
    }
    r.close();c.disconnect();String result=out.toString().trim();if(result.isEmpty())throw new Exception("AI returned no text");return result;
  }
  String read(InputStream in)throws Exception{BufferedReader r=new BufferedReader(new InputStreamReader(in,"UTF-8"));StringBuilder s=new StringBuilder();String x;while((x=r.readLine())!=null)s.append(x);return s.toString();}

  void speak(String text){
    if(tts==null){status.setText("●  Voice engine not ready");return;}
    String clean=text.replace("**","").replace("###","").trim(); if(clean.length()>3500)clean=clean.substring(0,3500);
    String id="studio-"+System.currentTimeMillis(); Bundle p=new Bundle();p.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID,id);
    if(audioManager!=null && audioManager.getStreamVolume(AudioManager.STREAM_MUSIC)==0){status.setText("●  Media volume is muted");return;}
    int lang=tts.isLanguageAvailable(Locale.US); if(lang==TextToSpeech.LANG_MISSING_DATA||lang==TextToSpeech.LANG_NOT_SUPPORTED){status.setText("●  TTS English data unavailable");return;}
    int result=tts.speak(clean,TextToSpeech.QUEUE_FLUSH,p,id); if(result==TextToSpeech.ERROR)status.setText("●  Voice playback failed");
  }
  void chooseModel(){int checked=Math.max(0,Arrays.asList(MODELS).indexOf(model));new AlertDialog.Builder(this).setTitle("Choose AI model").setSingleChoiceItems(MODELS,checked,(d,w)->{model=MODELS[w];prefs.edit().putString("model",model).apply();modelLabel.setText("Model: "+model);d.dismiss();}).show();}
  void chooseVoice(){if(tts==null)return;ArrayList<Voice> vs=new ArrayList<>();for(Voice v:tts.getVoices())if(v.getLocale()!=null&&v.getLocale().getLanguage().equals("en"))vs.add(v);Collections.sort(vs,(a,b)->a.getName().compareToIgnoreCase(b.getName()));String[] names=new String[vs.size()+1];names[0]="Red — best available native voice";for(int i=0;i<vs.size();i++)names[i+1]=vs.get(i).getName()+" | "+vs.get(i).getLocale();new AlertDialog.Builder(this).setTitle("Preset Voices").setItems(names,(d,w)->{if(w==0){selectedVoiceName="";tts.setLanguage(Locale.US);voiceLabel.setText("Voice: Red — best available native voice");}else{selectedVoiceName=vs.get(w-1).getName();tts.setVoice(vs.get(w-1));voiceLabel.setText("Voice: "+names[w]);}prefs.edit().putString("voice",selectedVoiceName).apply();}).show();}
  void settings(){LinearLayout l=new LinearLayout(this);l.setOrientation(LinearLayout.VERTICAL);l.setPadding(30,8,30,8);EditText e=new EditText(this);e.setHint("AI endpoint");e.setText(endpoint);e.setSingleLine();l.addView(e);TextView n=tv("PocketPal/Ollama /api/chat or OpenAI-compatible /v1/chat/completions. Default is localhost.",12,MUTED);n.setPadding(0,10,0,0);l.addView(n);new AlertDialog.Builder(this).setTitle("Studio Connection").setView(l).setPositiveButton("Save",(d,w)->{endpoint=e.getText().toString().trim();prefs.edit().putString("endpoint",endpoint).apply();status.setText("●  Endpoint saved");}).setNegativeButton("Cancel",null).show();}
  void toast(String s){Toast.makeText(this,s,Toast.LENGTH_SHORT).show();}
  @Override protected void onDestroy(){if(elapsedTicker!=null)mainHandler.removeCallbacks(elapsedTicker);if(recognizer!=null)recognizer.destroy();if(tts!=null)tts.shutdown();io.shutdownNow();super.onDestroy();}
}
