import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import logo from "@/assets/littlered-logo.png.asset.json";
import { AnimatedBackground } from "@/components/studio/AnimatedBackground";
import { StudioButton } from "@/components/studio/ui";
import { Field } from "@/components/studio/AiOutput";
import {
  adoptSessionFromAuthHash,
  sendPasswordReset,
  signIn,
  signUp,
  updatePassword,
} from "@/lib/supabase-rest";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({ component: AuthPage });

type Mode = "signin" | "signup" | "reset" | "update";

function AuthPage() {
  const [mode, setMode] = useState<Mode>("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void adoptSessionFromAuthHash()
      .then((session) => {
        if (session) setMode("update");
      })
      .catch(() => undefined);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "reset") {
        if (!email.trim()) {
          toast.error("Enter the email address for your Studio account.");
          return;
        }
        await sendPasswordReset(email.trim());
        toast.success("Password reset instructions sent. Check your email.");
        setMode("signin");
        return;
      }
      if (password.length < 8) {
        toast.error("Use a password with at least 8 characters.");
        return;
      }
      if (mode === "update") {
        await updatePassword(password);
        toast.success("Password updated. Welcome back to the Studio.");
        window.location.replace("/");
        return;
      }
      const r =
        mode === "signup"
          ? await signUp(email.trim(), password, name || "Creator")
          : await signIn(email.trim(), password);
      if (mode === "signup" && !("access_token" in r)) {
        toast.success(
          "Account created. Check your email if confirmation is required, then sign in.",
        );
        setMode("signin");
      } else window.location.replace("/");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  };

  const title =
    mode === "signup"
      ? "Create your Studio account"
      : mode === "reset"
        ? "Reset your password"
        : mode === "update"
          ? "Choose a new password"
          : "Welcome back";
  const description =
    mode === "reset"
      ? "We will send password-reset instructions to your account email."
      : mode === "update"
        ? "Choose a new password for your Studio account."
        : "Your account keeps Buddy, projects and entitlements available across devices.";

  return (
    <>
      <AnimatedBackground />
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-5">
        <img src={logo.url} alt="Little Red's Big Studio" className="mx-auto w-56" />
        <section className="glass-panel rounded-2xl p-5">
          <h1 className="text-center font-display text-xl font-black text-glow">{title}</h1>
          <p className="my-3 text-center text-xs text-muted-foreground">{description}</p>
          <form onSubmit={submit} className="space-y-3">
            {mode === "signup" && (
              <Field
                label="Display name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Little Red"
              />
            )}
            {mode !== "update" && (
              <Field
                label="Email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            )}
            {mode !== "reset" && (
              <Field
                label="Password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
              />
            )}
            <StudioButton className="w-full" type="submit" disabled={busy}>
              {busy
                ? "Working…"
                : mode === "signup"
                  ? "Create account"
                  : mode === "reset"
                    ? "Send reset email"
                    : mode === "update"
                      ? "Update password"
                      : "Sign in"}
            </StudioButton>
          </form>
          {mode !== "update" && (
            <div className="mt-4 space-y-2 text-center text-xs text-muted-foreground">
              {mode === "signin" && (
                <button className="block w-full underline" onClick={() => setMode("reset")}>
                  Forgot your password?
                </button>
              )}
              <button
                className="block w-full underline"
                onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
              >
                {mode === "signup"
                  ? "Already have an account? Sign in"
                  : "Need an account? Create one"}
              </button>
            </div>
          )}
        </section>
        <a href="/" className="text-center text-xs text-muted-foreground underline">
          Back to the studio
        </a>
      </main>
    </>
  );
}
