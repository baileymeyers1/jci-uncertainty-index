"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: true,
      callbackUrl: "/"
    });

    if (result?.error) {
      setError("Invalid credentials.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card p-8 space-y-4 max-w-md w-full">
      <div>
        <h1 className="text-3xl font-serif text-ink-900">Welcome back</h1>
        <p className="subtle mt-2">Sign in to manage the Uncertainty Index.</p>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-semibold text-ink-700">Email</label>
        <input
          type="email"
          className="input"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-semibold text-ink-700">Password</label>
        <input
          type="password"
          className="input"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </div>
      {error ? <p className="text-sm text-ember-600">{error}</p> : null}
      <button
        type="submit"
        className="button-primary w-full"
        disabled={loading}
      >
        {loading ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
