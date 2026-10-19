import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { IndependentStudioHome } from "./components/studio/IndependentStudioHome";
import "./styles.css";

class StudioErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
  componentDidCatch(error: unknown) {
    console.error("[Studio] startup error:", error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main style={{minHeight:"100vh",background:"#090507",color:"#fff",fontFamily:"system-ui,sans-serif",padding:20}}>
        <h1>Little Red's Big Studio</h1>
        <p style={{color:"#ff7183",fontWeight:800}}>Studio startup error</p>
        <p style={{wordBreak:"break-word",lineHeight:1.5}}>{this.state.error}</p>
        <button type="button" onClick={() => location.reload()} style={{padding:"12px 18px",border:0,borderRadius:20,background:"#d71932",color:"#fff",fontWeight:700}}>Retry Studio</button>
      </main>
    );
  }
}

window.addEventListener("error", (event) => {
  console.error("[Studio] window error", event.error || event.message);
});
window.addEventListener("unhandledrejection", (event) => {
  console.error("[Studio] rejection", event.reason);
});

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StudioErrorBoundary>
      <IndependentStudioHome />
    </StudioErrorBoundary>,
  );
} else {
  document.body.innerHTML =
    "<main style='padding:24px;color:white;background:#090507;min-height:100vh;font-family:sans-serif'><h1>Little Red's Big Studio</h1><p>Android root element missing.</p></main>";
}
