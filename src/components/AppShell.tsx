"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { Dashboard } from "@/components/Dashboard";
import { Automation } from "@/components/Automation";

export function AppShell() {
  const [tab, setTab] = useState<"dashboard" | "automation">("dashboard");

  return (
    <div className="min-h-screen bg-sand-50">
      <header className="border-b border-sand-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-ink-600">JCI</p>
            <h1 className="text-3xl font-serif text-ink-900">Uncertainty Index</h1>
          </div>
          <div className="flex gap-2">
            <button
              className={
                tab === "dashboard"
                  ? "button-primary"
                  : "button-secondary"
              }
              onClick={() => setTab("dashboard")}
            >
              Dashboard
            </button>
            <button
              className={
                tab === "automation"
                  ? "button-primary"
                  : "button-secondary"
              }
              onClick={() => setTab("automation")}
            >
              Context & Automation
            </button>
            <button className="button-secondary" onClick={() => signOut()}>
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">
        {tab === "dashboard" ? <Dashboard /> : <Automation />}
      </main>
    </div>
  );
}
