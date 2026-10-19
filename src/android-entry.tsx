import { Component, type ReactNode, lazy, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

const BuddyLiveChat = lazy(async () => {
  const module = await import("./components/studio/BuddyLiveChat");
  return { default: module.BuddyLiveChat };
});

class BootErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: unknown) { return { error: error instanceof Error ? error.message : String(error) }; }
  componentDidCatch(error: unknown) { console.error("[Studio] Buddy startup error:", error); }
  render() {
    if (!this.state.error) return this.props.children;
    return <section style={{padding:20,borderRadius:20,border:"1px solid #6b1722",background:"#18080b"}}>
      <b style={{color:"#ff6b7a"}}>Buddy startup error</b>
      <p style={{wordBreak:"break-word",lineHeight:1.5}}>{this.state.error}</p>
      <button onClick={() => location.reload()} style={{padding:"12px 18px",border:0,borderRadius:20,background:"#d71932",color:"#fff",fontWeight:700}}>Retry Buddy</button>
    </section>;
  }
}

function AndroidStudioHome() {
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("Starting Studio…");
  useEffect(() => {
    const timer = window.setTimeout(() => { setReady(true); setMessage("Studio ready."); }, 300);
    const onError = (e: ErrorEvent) => console.error("[Studio] window error", e.error || e.message);
    const onReject = (e: PromiseRejectionEvent) => console.error("[Studio] rejection", e.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onReject);
    return () => { window.clearTimeout(timer); window.removeEventListener("error", onError); window.removeEventListener("unhandledrejection", onReject); };
  }, []);
  return <div style={{minHeight:"100vh",background:"#090507",color:"#fff",fontFamily:"system-ui,-apple-system,sans-serif"}}>
    <header style={{padding:"16px 18px",borderBottom:"1px solid rgba(255,255,255,.1)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div style={{fontWeight:900,letterSpacing:".08em"}}>LITTLE RED'S BIG STUDIO</div>
      <span style={{fontSize:11,padding:"6px 10px",borderRadius:20,border:"1px solid rgba(255,60,90,.4)",color:"#ff5b70"}}>ANDROID</span>
    </header>
    <main style={{maxWidth:760,margin:"0 auto",padding:"20px 14px 60px"}}>
      <section style={{padding:22,borderRadius:24,border:"1px solid rgba(255,60,90,.25)",background:"rgba(0,0,0,.5)"}}>
        <div style={{fontSize:11,fontWeight:800,letterSpacing:".2em",color:"#ff5b70"}}>RED'S CHATGPT BUDDY</div>
        <h1 style={{fontSize:34,lineHeight:1.05,margin:"10px 0"}}>Your creative studio.</h1>
        <p style={{color:"rgba(255,255,255,.65)",lineHeight:1.55}}>Talk, type, use your microphone, create and build from one place.</p>
        <div style={{fontSize:12,color:"#ff7183",marginTop:12}}>{message}</div>
      </section>
      <div style={{marginTop:14}}>
        {ready ? <BootErrorBoundary><Suspense fallback={<section style={{padding:20,color:"rgba(255,255,255,.6)"}}>Loading Buddy…</section>}><BuddyLiveChat /></Suspense></BootErrorBoundary> : <section style={{padding:20,color:"rgba(255,255,255,.6)"}}>Starting Buddy…</section>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10,marginTop:14}}>
        {["Create — music, images and video.","Voice — Red voice and Android audio.","Free-first — local/open routes first."].map(x => <div key={x} style={{padding:15,borderRadius:18,border:"1px solid rgba(255,255,255,.1)",color:"rgba(255,255,255,.65)",fontSize:12}}>{x}</div>)}
      </div>
    </main>
  </div>;
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<AndroidStudioHome />);
else document.body.innerHTML = "<main style='padding:24px;color:white;background:#090507;min-height:100vh;font-family:sans-serif'><h1>Little Red's Big Studio</h1><p>Android root element missing.</p></main>";
