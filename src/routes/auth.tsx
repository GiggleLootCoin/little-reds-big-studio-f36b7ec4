import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import logo from "@/assets/littlered-logo.png.asset.json";
import { AnimatedBackground } from "@/components/studio/AnimatedBackground";
import { StudioButton } from "@/components/studio/ui";
import { Field } from "@/components/studio/AiOutput";
import { sendPasswordReset, signIn, signUp } from "@/lib/supabase-rest";

export const Route = createFileRoute("/auth")({ component: AuthPage });

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      if (mode === "signup") {
        const result = await signUp(email.trim(), password, name.trim() || "Creator");
        if (!("access_token" in result)) {
          setStatus("Check your email to confirm your account, then sign in.");
          setMode("signin");
          return;
        }
      } else {
        await signIn(email.trim(), password);
      }
      navigate({ to: "/" });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Authentication failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    if (!email.trim()) {
      setStatus("Enter your email address first.");
      return;
    }
    setBusy(true);
    try {
      await sendPasswordReset(email.trim());
      setStatus("Password reset email sent. Check your inbox.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to send the reset email.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AnimatedBackground />
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-5">
        <img src={logo.url} alt="Little Red's Big Studio" className="mx-auto w-56" />
        <section className="glass-panel rounded-2xl p-5">
          <h1 className="text-center font-display text-xl font-black text-glow">
            {mode === "signup" ? "Create your Studio account" : "Welcome back"}
          </h1>
          <p className="my-3 text-center text-xs text-muted-foreground">
            Your identity, seven-day trial and Studio projects follow your account across devices.
          </p>
          <form onSubmit={submit} className="space-y-3">
            {mode === "signup" && (
              <Field
                label="Display name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your creator name"
                required
              />
            )}
            <Field
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
            <Field
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              minLength={6}
              required
            />
            <StudioButton className="w-full" type="submit" disabled={busy}>
              {busy ? "Working…" : mode === "signup" ? "Start my 7-day trial" : "Sign in"}
            </StudioButton>
          </form>
          {status && <p className="mt-3 text-center text-xs text-muted-foreground">{status}</p>}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-xs">
            <button
              type="button"
              className="underline underline-offset-4"
              onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
            >
              {mode === "signup" ? "Already have an account? Sign in" : "Need an account? Sign up"}
            </button>
            {mode === "signin" && (
              <button type="button" className="underline underline-offset-4" onClick={() => void resetPassword()}>
                Forgot password?
              </button>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
