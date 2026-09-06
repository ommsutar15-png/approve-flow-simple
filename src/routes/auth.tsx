import { useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in | ApproveFlow" },
      {
        name: "description",
        content: "Sign in to ApproveFlow to send content, collect approvals and keep every revision in one place.",
      },
      { property: "og:title", content: "Sign in | ApproveFlow" },
      { property: "og:description", content: "Client approval and content review for creative agencies." },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "forgot";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/dashboard", replace: true });
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName, organization_name: orgName },
          },
        });
        if (error) throw error;
        if (data.session) {
          navigate({ to: "/dashboard", replace: true });
        } else {
          toast.success("Check your email to confirm your account.");
          setMode("signin");
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("Password reset link sent.");
        setMode("signin");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between border-r border-border bg-secondary/40 p-12 lg:flex">
        <Link to="/" className="font-display text-lg font-semibold tracking-tight">
          ApproveFlow
        </Link>
        <div className="max-w-sm space-y-4">
          <h2 className="font-display text-3xl leading-tight font-semibold tracking-tight">
            Send content. Get clear approval.
          </h2>
          <p className="text-sm text-muted-foreground">
            Every version, comment and decision kept in one place — no more chasing feedback
            across chats and inboxes.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">Built for agencies, editors and creators.</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-1">
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              {mode === "signin"
                ? "Welcome back"
                : mode === "signup"
                  ? "Create your agency account"
                  : "Reset your password"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {mode === "forgot"
                ? "We'll email you a link to set a new password."
                : "Use your work email address."}
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            {mode === "signup" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="fullName">Your name</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="orgName">Agency name</Label>
                  <Input
                    id="orgName"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    required
                  />
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            {mode !== "forgot" && (
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading
                ? "Please wait…"
                : mode === "signin"
                  ? "Sign in"
                  : mode === "signup"
                    ? "Create account"
                    : "Send reset link"}
            </Button>
          </form>

          <div className="space-y-2 text-sm text-muted-foreground">
            {mode === "signin" && (
              <>
                <button className="underline-offset-4 hover:underline" onClick={() => setMode("forgot")}>
                  Forgot your password?
                </button>
                <p>
                  New here?{" "}
                  <button
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                    onClick={() => setMode("signup")}
                  >
                    Create an account
                  </button>
                </p>
              </>
            )}
            {mode !== "signin" && (
              <button
                className="font-medium text-foreground underline-offset-4 hover:underline"
                onClick={() => setMode("signin")}
              >
                Back to sign in
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
