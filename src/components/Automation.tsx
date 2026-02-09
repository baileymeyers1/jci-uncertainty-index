"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const ReactQuill = dynamic(() => import("react-quill"), { ssr: false });

interface Draft {
  id: string;
  month: string;
  html: string;
  status: string;
  createdAt: string;
  sendSchedule?: {
    id: string;
    scheduledAt: string;
    status: string;
  } | null;
}

interface HistoryResponse {
  drafts: Draft[];
  contexts: {
    id: string;
    month: string;
    context1: string;
    context2: string;
    context3: string;
  }[];
  recipients: { id: string; email: string; name: string | null }[];
  ingestRuns: { id: string; month: string; status: string; startedAt: string; message?: string | null }[];
}

async function fetchHistory(): Promise<HistoryResponse> {
  const res = await fetch("/api/newsletter/history");
  if (!res.ok) throw new Error("Failed to load history");
  return res.json();
}

async function fetchWeights() {
  const res = await fetch("/api/weights");
  if (!res.ok) throw new Error("Failed to load weights");
  return res.json() as Promise<{ weights: { survey: string; weight: number | null }[] }>;
}

export function Automation() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["history"], queryFn: fetchHistory });
  const { data: weightsData } = useQuery({ queryKey: ["weights"], queryFn: fetchWeights });
  const [context1, setContext1] = useState("");
  const [context2, setContext2] = useState("");
  const [context3, setContext3] = useState("");
  const [selectedDraft, setSelectedDraft] = useState<Draft | null>(null);
  const [draftHtml, setDraftHtml] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");

  const saveContext = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context1, context2, context3 })
      });
      if (!res.ok) throw new Error("Failed to save context");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["history"] })
  });

  const generateDraft = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/newsletter/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context1, context2, context3 })
      });
      if (!res.ok) throw new Error("Failed to generate draft");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["history"] })
  });

  const queueSend = useMutation({
    mutationFn: async (draftId: string) => {
      const res = await fetch("/api/newsletter/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId })
      });
      if (!res.ok) throw new Error("Failed to queue send");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["history"] })
  });

  const saveDraft = useMutation({
    mutationFn: async () => {
      if (!selectedDraft) return;
      const res = await fetch(`/api/newsletter/${selectedDraft.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html: draftHtml })
      });
      if (!res.ok) throw new Error("Failed to save draft");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["history"] })
  });

  const addRecipient = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/recipients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: recipientEmail, name: recipientName })
      });
      if (!res.ok) throw new Error("Failed to add recipient");
      return res.json();
    },
    onSuccess: () => {
      setRecipientEmail("");
      setRecipientName("");
      queryClient.invalidateQueries({ queryKey: ["history"] });
    }
  });

  const syncRecipients = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/recipients/sync", { method: "POST" });
      if (!res.ok) throw new Error("Failed to sync recipients");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["history"] })
  });

  const runIngest = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ingest/monthly", { method: "POST" });
      if (!res.ok) throw new Error("Failed to run ingest");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["history"] })
  });

  useEffect(() => {
    if (!data?.contexts?.length) return;
    if (context1 || context2 || context3) return;
    const latest = data.contexts[0];
    setContext1(latest.context1);
    setContext2(latest.context2);
    setContext3(latest.context3);
  }, [data, context1, context2, context3]);

  const updateWeight = useMutation({
    mutationFn: async (payload: { survey: string; weight: number }) => {
      const res = await fetch("/api/weights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error("Failed to update weight");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["weights"] })
  });

  if (isLoading || !data) {
    return <p className="subtle">Loading automation workspace...</p>;
  }

  return (
    <div className="space-y-10">
      <section className="card p-6 space-y-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="section-title">Monthly Context</h2>
            <p className="subtle">Provide three context inputs for Claude to weave into the analysis.</p>
          </div>
          <button className="button-secondary" onClick={() => runIngest.mutate()}>Run scrape now</button>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <textarea className="textarea" value={context1} onChange={(e) => setContext1(e.target.value)} placeholder="Context 1" />
          <textarea className="textarea" value={context2} onChange={(e) => setContext2(e.target.value)} placeholder="Context 2" />
          <textarea className="textarea" value={context3} onChange={(e) => setContext3(e.target.value)} placeholder="Context 3" />
        </div>
        <div className="flex flex-wrap gap-3">
          <button className="button-secondary" onClick={() => saveContext.mutate()}>Save context</button>
          <button className="button-primary" onClick={() => generateDraft.mutate()}>Generate draft</button>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[2fr,3fr]">
        <div className="card p-6">
          <h2 className="section-title">Drafts</h2>
          <p className="subtle mt-1">Select a draft to edit or queue for send.</p>
          <div className="mt-4 space-y-3 max-h-[420px] overflow-auto">
            {data.drafts.map((draft) => (
              <button
                key={draft.id}
                className={`w-full text-left rounded-xl border px-4 py-3 transition ${
                  selectedDraft?.id === draft.id ? "border-ink-900 bg-sand-100" : "border-sand-200"
                }`}
                onClick={() => {
                  setSelectedDraft(draft);
                  setDraftHtml(draft.html);
                }}
              >
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-ink-900">{draft.month}</p>
                  <span className="text-xs uppercase tracking-[0.2em] text-ink-600">{draft.status}</span>
                </div>
                <p className="subtle text-xs mt-2">Created {new Date(draft.createdAt).toLocaleString()}</p>
              </button>
            ))}
          </div>
        </div>
        <div className="card p-6">
          <h2 className="section-title">Draft Editor</h2>
          <p className="subtle mt-1">Edit the HTML content before scheduling a send.</p>
          {selectedDraft ? (
            <div className="mt-4 space-y-4">
              <ReactQuill theme="snow" value={draftHtml} onChange={setDraftHtml} />
              <div className="flex flex-wrap gap-3">
                <button className="button-secondary" onClick={() => saveDraft.mutate()}>Save edits</button>
                <button className="button-primary" onClick={() => queueSend.mutate(selectedDraft.id)}>Queue send</button>
              </div>
            </div>
          ) : (
            <p className="subtle mt-4">Select a draft to begin editing.</p>
          )}
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="card p-6">
          <h2 className="section-title">Recipients</h2>
          <p className="subtle mt-1">Manage the single list and sync to Brevo.</p>
          <div className="mt-4 space-y-3">
            <input className="input" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} placeholder="Email" />
            <input className="input" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Name (optional)" />
            <div className="flex flex-wrap gap-3">
              <button className="button-secondary" onClick={() => addRecipient.mutate()}>Add recipient</button>
              <button className="button-primary" onClick={() => syncRecipients.mutate()}>Sync to Brevo</button>
            </div>
          </div>
          <ul className="mt-4 space-y-2 text-sm">
            {data.recipients.map((recipient) => (
              <li key={recipient.id} className="flex items-center justify-between border-b border-sand-200 pb-2">
                <span>{recipient.email}</span>
                <span className="subtle">{recipient.name ?? ""}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-6">
          <h2 className="section-title">Ingest Runs</h2>
          <p className="subtle mt-1">Recent scrape history.</p>
          <ul className="mt-4 space-y-3 text-sm">
            {data.ingestRuns.map((run) => (
              <li key={run.id} className="border-b border-sand-200 pb-2">
                <div className="flex items-center justify-between">
                  <span>{run.month}</span>
                  <span className={run.status === "SUCCESS" ? "text-moss-600" : "text-ember-600"}>{run.status}</span>
                </div>
                {run.message ? <p className="subtle text-xs mt-1">{run.message}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="card p-6">
        <h2 className="section-title">Meta Weights</h2>
        <p className="subtle mt-1">Adjust survey weights (writes to Meta tab).</p>
        <div className="mt-4 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-600">
                <th className="py-2">Survey</th>
                <th className="py-2">Weight</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {weightsData?.weights?.map((item) => (
                <WeightRow key={item.survey} survey={item.survey} weight={item.weight} onSave={updateWeight.mutate} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function WeightRow({
  survey,
  weight,
  onSave
}: {
  survey: string;
  weight: number | null;
  onSave: (payload: { survey: string; weight: number }) => void;
}) {
  const [value, setValue] = useState(weight?.toString() ?? "");

  return (
    <tr className="border-t border-sand-200">
      <td className="py-2 pr-4 font-medium">{survey}</td>
      <td className="py-2">
        <input
          className="input w-24"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          type="number"
          step="0.1"
        />
      </td>
      <td className="py-2 text-right">
        <button
          className="button-secondary"
          onClick={() => {
            const numeric = Number(value);
            if (!Number.isFinite(numeric)) return;
            onSave({ survey, weight: numeric });
          }}
        >
          Save
        </button>
      </td>
    </tr>
  );
}
