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

interface IngestSourceValue {
  id: string;
  sourceName: string;
  value: number | null;
  status: string;
  message?: string | null;
}

interface IngestRunDetail {
  id: string;
  month: string;
  status: string;
  startedAt: string;
  message?: string | null;
  sources?: IngestSourceValue[];
}

interface WeightEntry {
  survey: string;
  weight: number | null;
  mean: number | null;
  stdev: number | null;
  frequency: string;
  sourceUrl: string;
  latestValue: number | null;
  latestZ: number | null;
}

async function fetchHistory(): Promise<HistoryResponse> {
  const res = await fetch("/api/newsletter/history");
  if (!res.ok) throw new Error("Failed to load history");
  return res.json();
}

async function fetchWeights() {
  const res = await fetch("/api/weights");
  if (!res.ok) throw new Error("Failed to load weights");
  return res.json() as Promise<{ weights: WeightEntry[] }>;
}

async function fetchIngestHistory(): Promise<{ ingestRuns: IngestRunDetail[] }> {
  const res = await fetch("/api/ingest/history");
  if (!res.ok) throw new Error("Failed to load ingest history");
  return res.json();
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
  const [sendDraftId, setSendDraftId] = useState("");
  const [sendMode, setSendMode] = useState<"all" | "selected" | "single">("all");
  const [sendEmail, setSendEmail] = useState("");
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [reviewRuns, setReviewRuns] = useState<IngestRunDetail[]>([]);
  const [reviewEdits, setReviewEdits] = useState<Record<string, Record<string, string>>>({});
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewSaving, setReviewSaving] = useState(false);
  const contextComplete = context1.trim() && context2.trim() && context3.trim();
  const canSendNow =
    !!sendDraftId &&
    (sendMode === "all" ||
      (sendMode === "single" && sendEmail.trim().length > 0) ||
      (sendMode === "selected" && selectedRecipientIds.length > 0));

  async function openReviewForMonths(months: string[]) {
    try {
      setReviewError(null);
      const history = await fetchIngestHistory();
      const runs = history.ingestRuns.filter((run) => months.includes(run.month));
      const edits: Record<string, Record<string, string>> = {};
      runs.forEach((run) => {
        const monthEdits: Record<string, string> = {};
        run.sources?.forEach((source) => {
          monthEdits[source.sourceName] =
            source.value !== null && source.value !== undefined ? String(source.value) : "";
        });
        edits[run.month] = monthEdits;
      });
      setReviewRuns(runs);
      setReviewEdits(edits);
      setReviewOpen(true);
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "Unable to load ingest review.");
    }
  }

  function updateReviewValue(month: string, sourceName: string, value: string) {
    setReviewEdits((prev) => ({
      ...prev,
      [month]: {
        ...(prev[month] ?? {}),
        [sourceName]: value
      }
    }));
  }

  async function applyReviewUpdates() {
    if (!reviewRuns.length) {
      setReviewOpen(false);
      return;
    }
    try {
      setReviewSaving(true);
      setReviewError(null);
      await Promise.all(
        reviewRuns.map(async (run) => {
          const rawValues = reviewEdits[run.month] ?? {};
          const parsed: Record<string, string | number | null> = {};
          Object.entries(rawValues).forEach(([key, value]) => {
            const trimmed = value.trim();
            if (!trimmed) {
              parsed[key] = null;
              return;
            }
            const num = Number(trimmed);
            parsed[key] = Number.isFinite(num) ? num : trimmed;
          });
          const res = await fetch("/api/ingest/manual", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ month: run.month, values: parsed })
          });
          if (!res.ok) {
            const text = await res.text();
            throw new Error(text || `Failed to update ${run.month}`);
          }
        })
      );
      setReviewOpen(false);
      setActionSuccess("Manual updates applied.");
      queryClient.invalidateQueries({ queryKey: ["overview"] });
      queryClient.invalidateQueries({ queryKey: ["history"] });
      queryClient.invalidateQueries({ queryKey: ["ingest-history"] });
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "Failed to apply updates.");
    } finally {
      setReviewSaving(false);
    }
  }

  const saveContext = useMutation({
    mutationFn: async () => {
      setActionError(null);
      setActionSuccess(null);
      const res = await fetch("/api/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context1, context2, context3 })
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to save context");
      }
      return res.json();
    },
    onSuccess: () => {
      setActionSuccess("Context saved.");
      queryClient.invalidateQueries({ queryKey: ["history"] });
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : "Failed to save context")
  });

  const generateDraft = useMutation({
    mutationFn: async () => {
      setActionError(null);
      setActionSuccess(null);
      const res = await fetch("/api/newsletter/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context1, context2, context3 })
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to generate draft");
      }
      return res.json();
    },
    onSuccess: () => {
      setActionSuccess("Draft generated.");
      queryClient.invalidateQueries({ queryKey: ["history"] });
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : "Failed to generate draft")
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

  const sendNow = useMutation({
    mutationFn: async () => {
      setSendError(null);
      setSendSuccess(null);
      if (!sendDraftId) {
        throw new Error("Select a draft first");
      }
      const payload: {
        draftId: string;
        mode: "all" | "selected" | "single";
        recipientIds?: string[];
        recipientEmail?: string;
      } = {
        draftId: sendDraftId,
        mode: sendMode
      };
      if (sendMode === "single") {
        payload.recipientEmail = sendEmail;
      }
      if (sendMode === "selected") {
        payload.recipientIds = selectedRecipientIds;
      }
      const res = await fetch("/api/newsletter/send-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to send draft");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setSendSuccess(
        sendMode === "all"
          ? "Draft queued to send to the full list."
          : `Draft sent to ${data.sent ?? "recipients"}.`
      );
    },
    onError: (err) => setSendError(err instanceof Error ? err.message : "Failed to send draft")
  });

  const runIngest = useMutation({
    mutationFn: async () => {
      setActionError(null);
      setActionSuccess(null);
      const res = await fetch("/api/ingest/monthly", { method: "POST" });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to run ingest");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setActionSuccess("Ingest completed.");
      queryClient.invalidateQueries({ queryKey: ["history"] });
      const month = data?.result?.month;
      if (month) {
        openReviewForMonths([month]);
      }
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : "Failed to run ingest")
  });

  useEffect(() => {
    if (!data?.contexts?.length) return;
    if (context1 || context2 || context3) return;
    const latest = data.contexts[0];
    setContext1(latest.context1);
    setContext2(latest.context2);
    setContext3(latest.context3);
  }, [data, context1, context2, context3]);

  useEffect(() => {
    if (sendDraftId || !data?.drafts?.length) return;
    setSendDraftId(data.drafts[0].id);
  }, [data, sendDraftId]);

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
          <div className="flex flex-wrap gap-2">
            <button className="button-secondary" onClick={() => runIngest.mutate()}>
              Run scrape now
            </button>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <textarea className="textarea" value={context1} onChange={(e) => setContext1(e.target.value)} placeholder="Context 1" />
          <textarea className="textarea" value={context2} onChange={(e) => setContext2(e.target.value)} placeholder="Context 2" />
          <textarea className="textarea" value={context3} onChange={(e) => setContext3(e.target.value)} placeholder="Context 3" />
        </div>
        <div className="flex flex-wrap gap-3">
          <button className="button-secondary" onClick={() => saveContext.mutate()} disabled={!contextComplete}>
            Save context
          </button>
          <button className="button-primary" onClick={() => generateDraft.mutate()} disabled={!contextComplete}>
            Generate draft
          </button>
        </div>
        {actionError ? <p className="text-sm text-ember-600">{actionError}</p> : null}
        {actionSuccess ? <p className="text-sm text-moss-600">{actionSuccess}</p> : null}
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
            {data.recipients.map((recipient) => {
              const isSelected = selectedRecipientIds.includes(recipient.id);
              return (
                <li key={recipient.id} className="flex items-center justify-between border-b border-sand-200 pb-2">
                  <div className="flex items-center gap-2">
                    {sendMode === "selected" ? (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          setSelectedRecipientIds((prev) =>
                            prev.includes(recipient.id)
                              ? prev.filter((id) => id !== recipient.id)
                              : [...prev, recipient.id]
                          );
                        }}
                      />
                    ) : null}
                    <span>{recipient.email}</span>
                  </div>
                  <span className="subtle">{recipient.name ?? ""}</span>
                </li>
              );
            })}
          </ul>
          <div className="mt-6 border-t border-sand-200 pt-4">
            <h3 className="font-semibold text-ink-900">Send Draft Now</h3>
            <p className="subtle mt-1">Blast a draft to a single recipient, a selection, or the full list.</p>
            <div className="mt-3 grid gap-3">
              <label className="text-sm text-ink-700">
                Draft
                <select
                  className="input mt-1"
                  value={sendDraftId}
                  onChange={(e) => setSendDraftId(e.target.value)}
                >
                  {data.drafts.map((draft) => (
                    <option key={draft.id} value={draft.id}>
                      {draft.month} ({draft.status})
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-ink-700">
                Send to
                <select
                  className="input mt-1"
                  value={sendMode}
                  onChange={(e) => {
                    const mode = e.target.value as "all" | "selected" | "single";
                    setSendMode(mode);
                    if (mode !== "selected") {
                      setSelectedRecipientIds([]);
                    }
                  }}
                >
                  <option value="all">Entire list</option>
                  <option value="selected">Selected recipients</option>
                  <option value="single">Single email</option>
                </select>
              </label>
              {sendMode === "single" ? (
                <input
                  className="input"
                  value={sendEmail}
                  onChange={(e) => setSendEmail(e.target.value)}
                  placeholder="Recipient email"
                />
              ) : null}
              {sendMode === "selected" ? (
                <p className="text-xs text-ink-600">Use the checkboxes above to choose recipients.</p>
              ) : null}
              <button className="button-primary" onClick={() => sendNow.mutate()} disabled={!canSendNow}>
                Send draft now
              </button>
              {sendError ? <p className="text-sm text-ember-600">{sendError}</p> : null}
              {sendSuccess ? <p className="text-sm text-moss-600">{sendSuccess}</p> : null}
            </div>
          </div>
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
                <th className="py-2">Frequency</th>
                <th className="py-2">Source</th>
                <th className="py-2">Mean</th>
                <th className="py-2">Stdev</th>
                <th className="py-2">Latest Score</th>
                <th className="py-2">Latest Z</th>
                <th className="py-2">Weight</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {weightsData?.weights?.map((item) => (
                <WeightRow
                  key={item.survey}
                  survey={item.survey}
                  weight={item.weight}
                  mean={item.mean}
                  stdev={item.stdev}
                  frequency={item.frequency}
                  sourceUrl={item.sourceUrl}
                  latestValue={item.latestValue}
                  latestZ={item.latestZ}
                  onSave={updateWeight.mutate}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {reviewOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4">
          <div className="card max-h-[90vh] w-full max-w-5xl overflow-auto p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="section-title">Review Scrape Results</h3>
                <p className="subtle mt-1">Confirm values, flag no-change items, and adjust as needed.</p>
              </div>
              <button className="button-secondary" onClick={() => setReviewOpen(false)}>
                Close
              </button>
            </div>

            {reviewError ? <p className="mt-4 text-sm text-ember-600">{reviewError}</p> : null}

            <div className="mt-6 space-y-6">
              {reviewRuns.length ? (
                reviewRuns.map((run) => (
                  <div key={run.id} className="rounded-xl border border-sand-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-ink-900">{run.month}</p>
                      <span className="text-xs uppercase tracking-[0.2em] text-ink-600">{run.status}</span>
                    </div>
                    <div className="mt-3 overflow-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-ink-600">
                            <th className="py-2">Survey</th>
                            <th className="py-2">Status</th>
                            <th className="py-2">Value</th>
                            <th className="py-2">Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {run.sources?.map((source) => {
                            const noChange =
                              source.message?.includes("Carried forward prior value") ||
                              source.message?.includes("Preserved locked historical value");
                            return (
                              <tr key={source.id} className="border-t border-sand-200">
                                <td className="py-2 pr-4 font-medium">{source.sourceName}</td>
                                <td className="py-2 text-ink-700">{noChange ? "No change" : source.status}</td>
                                <td className="py-2">
                                  <input
                                    className="input w-32"
                                    type="number"
                                    step="0.1"
                                    value={reviewEdits[run.month]?.[source.sourceName] ?? ""}
                                    onChange={(e) => updateReviewValue(run.month, source.sourceName, e.target.value)}
                                  />
                                </td>
                                <td className="py-2 text-xs text-ink-600">{source.message ?? "—"}</td>
                              </tr>
                            );
                          }) ?? (
                            <tr>
                              <td className="py-2" colSpan={4}>
                                No source values recorded.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))
              ) : (
                <p className="subtle">No recent ingest runs to review.</p>
              )}
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button className="button-secondary" onClick={() => setReviewOpen(false)}>
                Cancel
              </button>
              <button className="button-primary" onClick={applyReviewUpdates} disabled={reviewSaving}>
                {reviewSaving ? "Applying..." : "Apply updates"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function WeightRow({
  survey,
  weight,
  mean,
  stdev,
  frequency,
  sourceUrl,
  latestValue,
  latestZ,
  onSave
}: {
  survey: string;
  weight: number | null;
  mean: number | null;
  stdev: number | null;
  frequency: string;
  sourceUrl: string;
  latestValue: number | null;
  latestZ: number | null;
  onSave: (payload: { survey: string; weight: number }) => void;
}) {
  const [value, setValue] = useState(weight?.toString() ?? "");

  return (
    <tr className="border-t border-sand-200">
      <td className="py-2 pr-4 font-medium">{survey}</td>
      <td className="py-2 text-ink-700 uppercase tracking-[0.2em] text-[10px]">{frequency}</td>
      <td className="py-2">
        <a className="text-ink-700 underline" href={sourceUrl} target="_blank" rel="noreferrer">
          Source
        </a>
      </td>
      <td className="py-2 text-ink-700">{mean ?? "—"}</td>
      <td className="py-2 text-ink-700">{stdev ?? "—"}</td>
      <td className="py-2 text-ink-700">{latestValue ?? "—"}</td>
      <td className="py-2 text-ink-700">{latestZ ?? "—"}</td>
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
