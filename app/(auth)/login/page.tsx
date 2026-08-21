"use client";

import { useState, useActionState } from "react";
import { signIn, signUp, type AuthState } from "../actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Card } from "@/components/ui/primitives";

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const action = mode === "signin" ? signIn : signUp;
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    action,
    undefined,
  );

  return (
    <main className="min-h-screen grid place-items-center bg-[var(--color-surface-sunken)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="text-3xl font-bold tracking-tight text-[var(--color-ink)]">
            VEYRA
          </span>
          <p className="mt-1 text-sm text-[var(--color-ink-secondary)]">
            The OS for made-to-order built environments
          </p>
        </div>

        <Card className="p-6">
          <div className="mb-5 flex rounded-md border border-[var(--color-border)] p-0.5 text-sm">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={
                  "flex-1 rounded px-3 py-1.5 font-medium transition-colors " +
                  (mode === m
                    ? "bg-[var(--color-red-tint)] text-[var(--color-red-hover)]"
                    : "text-[var(--color-ink-secondary)]")
                }
              >
                {m === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <form action={formAction} className="flex flex-col gap-4">
            {mode === "signup" && (
              <>
                <Field label="Your name" htmlFor="fullName" required>
                  <Input id="fullName" name="fullName" autoComplete="name" />
                </Field>
                <Field label="Company name" htmlFor="orgName" required>
                  <Input id="orgName" name="orgName" placeholder="Acme Interiors" />
                </Field>
              </>
            )}
            <Field label="Email" htmlFor="email" required>
              <Input id="email" name="email" type="email" autoComplete="email" />
            </Field>
            <Field
              label="Password"
              htmlFor="password"
              required
              hint={mode === "signup" ? "At least 8 characters" : undefined}
            >
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
              />
            </Field>

            {state?.error && (
              <p className="text-sm text-[var(--color-red)]">{state.error}</p>
            )}

            <Button type="submit" variant="primary" disabled={pending}>
              {pending
                ? "Please wait…"
                : mode === "signin"
                  ? "Sign in"
                  : "Create account"}
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
