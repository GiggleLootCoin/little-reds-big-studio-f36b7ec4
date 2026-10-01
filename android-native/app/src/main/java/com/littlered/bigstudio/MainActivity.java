package com.littlered.bigstudio;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.*;
import android.os.Bundle;
import android.speech.RecognizerIntent;
import android.speech.tts.TextToSpeech;
import android.view.*;
import android.widget.*;
import java.util.*;

public class MainActivity extends Activity {
    LinearLayout root, chat; TextView status; EditText input; TextToSpeech tts;
    final int PINK=Color.rgb(255,79,163);

    public void onCreate(Bundle b){
        super.onCreate(b); build();
        tts=new TextToSpeech(this,s->{if(s==TextToSpeech.SUCCESS)tts.setLanguage(Locale.US);});
    }
    TextView tv(String s,int size){
        TextView v=new TextView(this); v.setText(s); v.setTextColor(Color.WHITE);
        v.setTextSize(size); v.setPadding(18,12,18,12); return v;
    }
    void build(){
        root=new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(18,12,18,12); root.setBackgroundColor(Color.rgb(9,10,16));
        TextView title=tv("LITTLE RED'S BIG STUDIO",20); title.setGravity(Gravity.CENTER);
        root.addView(title,new LinearLayout.LayoutParams(-1,60));
        StudioOrb orb=new StudioOrb(); root.addView(orb,new LinearLayout.LayoutParams(-1,310));
        status=tv("Buddy is ready",15); status.setGravity(Gravity.CENTER);
        root.addView(status,new LinearLayout.LayoutParams(-1,48));
        ScrollView sc=new ScrollView(this); chat=new LinearLayout(this);
        chat.setOrientation(LinearLayout.VERTICAL); sc.addView(chat);
        root.addView(sc,new LinearLayout.LayoutParams(-1,0,1));
        LinearLayout bar=new LinearLayout(this);
        input=new EditText(this); input.setHint("Talk to Buddy…"); input.setTextColor(Color.WHITE);
        input.setHintTextColor(Color.GRAY); input.setSingleLine(true);
        Button send=new Button(this); send.setText("SEND");
        Button mic=new Button(this); mic.setText("MIC");
        bar.addView(input,new LinearLayout.LayoutParams(0,58,1));
        bar.addView(mic,new LinearLayout.LayoutParams(82,58));
        bar.addView(send,new LinearLayout.LayoutParams(88,58)); root.addView(bar);
        setContentView(root);
        send.setOnClickListener(v->respond(input.getText().toString()));
        mic.setOnClickListener(v->listen());
        add("Buddy","I'm here. Say something, Red.");
    }
    void add(String who,String msg){
        TextView v=tv(who+"\n"+msg,15); v.setBackgroundColor(Color.rgb(22,24,34));
        LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);
        p.setMargins(0,6,0,6); chat.addView(v,p);
    }
    void respond(String s){
        if(s==null||s.trim().isEmpty())return;
        input.setText(""); add("You",s);
        String r="I'm Buddy. I heard you: "+s; add("Buddy",r);
        status.setText("Buddy replied with voice");
        if(tts!=null)tts.speak(r,TextToSpeech.QUEUE_FLUSH,null,"buddy");
    }
    void listen(){
        if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},7); return;
        }
        Intent i=new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_PROMPT,"Talk to Buddy"); startActivityForResult(i,8);
    }
    protected void onActivityResult(int r,int c,Intent d){
        super.onActivityResult(r,c,d);
        if(r==8&&c==RESULT_OK&&d!=null){
            ArrayList<String>x=d.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            if(x!=null&&!x.isEmpty()){input.setText(x.get(0));respond(x.get(0));}
        }
    }
    protected void onDestroy(){
        if(tts!=null){tts.stop();tts.shutdown();} super.onDestroy();
    }
    class StudioOrb extends View{
        Paint p=new Paint(1);
        StudioOrb(){super(MainActivity.this);}
        protected void onDraw(Canvas c){
            float x=getWidth()/2f,y=getHeight()/2f; c.drawColor(Color.rgb(9,10,16));
            p.setShader(new RadialGradient(x,y,155,new int[]{Color.WHITE,PINK,Color.rgb(110,20,120),Color.TRANSPARENT},null,Shader.TileMode.CLAMP));
            c.drawCircle(x,y,150,p); p.setShader(null); p.setColor(Color.WHITE);
            p.setTextAlign(Paint.Align.CENTER); p.setTextSize(24); c.drawText("BUDDY",x,y+8,p);
        }
    }
}