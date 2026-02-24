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
  sendLogs: {
    id: string;
    month: string;
    mode: string;
    status: string;
    recipientCount: number | null;
    recipientEmail: string | null;
    createdAt: string;
    message?: string | null;
  }[];
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

interface ApprovalRecipient {
  id: string;
  userId: string;
  email: string;
  name: string | null;
}

interface SourceSchedule {
  sourceName: string;
  sourceUrl: string;
  frequency: string;
  releaseCadence: string;
  advanceMonths: number;
  nextExpectedReleaseDate: string;
}

interface ApprovalRow {
  id: string;
  sourceName: string;
  sourceUrl: string;
  value: number | null;
  previousValue: number | null;
  delta: number | null;
  status: string;
  message: string | null;
  carriedForward: boolean;
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED";
  approvalNote: string | null;
  approvedAt: string | null;
  approvedBy: {
    id: string;
    email: string;
    name: string | null;
  } | null;
  nextExpectedReleaseDate: string | null;
  dueState: "PAST_DUE" | "UPCOMING" | "UNKNOWN";
  dueLabel: string;
}

interface ApprovalSnapshot {
  month: string;
  ingestRunId: string;
  ingestStatus: string;
  startedAt: string;
  message: string | null;
  allApproved: boolean;
  pendingCount: number;
  sourceCount: number;
  rows: ApprovalRow[];
}

interface ApprovalMonthResponse {
  month: string;
  snapshot: ApprovalSnapshot | null;
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

async function fetchApprovalRecipients() {
  const res = await fetch("/api/approval-recipients");
  if (!res.ok) throw new Error("Failed to load approval recipients");
  return res.json() as Promise<{ recipients: ApprovalRecipient[] }>;
}

async function fetchSourceSchedules() {
  const res = await fetch("/api/source-schedules");
  if (!res.ok) throw new Error("Failed to load source schedules");
  return res.json() as Promise<{ schedules: SourceSchedule[] }>;
}

async function fetchApprovalMonth(month: string): Promise<ApprovalMonthResponse> {
  const res = await fetch(`/api/approvals/month?month=${encodeURIComponent(month)}`);
  if (res.status === 404) {
    return { month, snapshot: null };
  }
  if (!res.ok) throw new Error("Failed to load approval snapshot");
  return res.json();
}

function currentMonthLabel() {
  return new Date().toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function toDateInput(value: string) {
  return value.slice(0, 10);
}

export function Automation({
  initialReviewOpen = false,
  initialReviewMonth
}: {
  initialReviewOpen?: boolean;
  initialReviewMonth?: string;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["history"], queryFn: fetchHistory });
  const { data: weightsData } = useQuery({ queryKey: ["weights"], queryFn: fetchWeights });
  const { data: approvalRecipientsData } = useQuery({
    queryKey: ["approval-recipients"],
    queryFn: fetchApprovalRecipients
  });
  const { data: sourceSchedulesData } = useQuery({
    queryKey: ["source-schedules"],
    queryFn: fetchSourceSchedules
  });

  const [context1, setContext1] = useState("");
  const [context2, setContext2] = useState("");
  const [context3, setContext3] = useState("");
  const [selectedDraft, setSelectedDraft] = useState<Draft | null>(null);
  const [draftHtml, setDraftHtml] = useState("");
  const [editorMode, setEditorMode] = useState<"edit" | "preview">("edit");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [approverEmail, setApproverEmail] = useState("");
  const [sendDraftId, setSendDraftId] = useState("");
  const [sendMode, setSendMode] = useState<"all" | "selected" | "single">("all");
  const [sendEmail, setSendEmail] = useState("");
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(initialReviewOpen);
  const [reviewMonth, setReviewMonth] = useState(initialReviewMonth ?? "");
  const [reviewEdits, setReviewEdits] = useState<Record<string, string>>({});
  const [reviewNote, setReviewNote] = useState("");

  useEffect(() => {
    if (reviewMonth) return;
    if (!data?.ingestRuns?.length) {
      setReviewMonth(currentMonthLabel());
      return;
    }
    setReviewMonth(data.ingestRuns[0].month);
  }, [data, reviewMonth]);

  const { data: approvalMonthData, refetch: refetchApprovalMonth } = useQuery({
    queryKey: ["approval-month", reviewMonth],
    queryFn: () => fetchApprovalMonth(reviewMonth),
    enabled: !!reviewMonth
  });

  const approvalSnapshot = approvalMonthData?.snapshot ?? null;

  useEffect(() => {
    if (!approvalSnapshot) return;
    const next: Record<string, string> = {};
    approvalSnapshot.rows.forEach((row) => {
      next[row.id] = row.value !== null && row.value !== undefined ? String(row.value) : "";
    });
    setReviewEdits(next);
  }, [approvalSnapshot]);

  const contextComplete = context1.trim() && context2.trim() && context3.trim();
  const canSendNow =
    !!sendDraftId &&
    (sendMode === "all" ||
      (sendMode === "single" && sendEmail.trim().length > 0) ||
      (sendMode === "selected" && selectedRecipientIds.length > 0));
  const selectedSendDraft = data?.drafts?.find((draft) => draft.id === sendDraftId) ?? null;

  const { data: sendApprovalData } = useQuery({
    queryKey: ["approval-month-send", selectedSendDraft?.month],
    queryFn: () => fetchApprovalMonth(selectedSendDraft?.month ?? ""),
    enabled: !!selectedSendDraft?.month
  });
  const sendApprovalReady = !!sendApprovalData?.snapshot?.allApproved;

  const generateDraft = useMutation({
    mutationFn: async () => {
      setActionError(null);
      setActionSuccess(null);
      const month = reviewMonth || currentMonthLabel();
      const res = await fetch("/api/newsletter/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context1, context2, context3, month })
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

  const deleteDraft = useMutation({
    mutationFn: async (draftId: string) => {
      const res = await fetch(`/api/newsletter/${draftId}`, { method: "DELETE" });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to delete draft");
      }
      return res.json();
    },
    onSuccess: () => {
      setSelectedDraft(null);
      setDraftHtml("");
      queryClient.invalidateQueries({ queryKey: ["history"] });
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : "Failed to delete draft")
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

  const removeRecipient = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch("/api/recipients", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to remove recipient");
      }
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["history"] }),
    onError: (err) => setActionError(err instanceof Error ? err.message : "Failed to remove recipient")
  });

  const addApprover = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/approval-recipients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: approverEmail })
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to add approver");
      }
      return res.json();
    },
    onSuccess: () => {
      setApproverEmail("");
      queryClient.invalidateQueries({ queryKey: ["approval-recipients"] });
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : "Failed to add approver")
  });

  const removeApprover = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch("/api/approval-recipients", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to remove approver");
      }
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["approval-recipients"] }),
    onError: (err) => setActionError(err instanceof Error ? err.message : "Failed to remove approver")
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
    onSuccess: (response) => {
      setSendSuccess(
        sendMode === "all"
          ? "Draft sent to the full list."
          : `Draft sent to ${response.sent ?? "recipients"}.`
      );
      queryClient.invalidateQueries({ queryKey: ["history"] });
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
    onSuccess: async (result) => {
      const month = result?.result?.month;
      setActionSuccess(month ? `Ingest completed for ${month}.` : "Ingest completed.");
      await queryClient.invalidateQueries({ queryKey: ["history"] });
      if (month) {
        setReviewMonth(month);
        setReviewOpen(true);
        queryClient.invalidateQueries({ queryKey: ["approval-month", month] });
      }
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : "Failed to run ingest")
  });

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

  const updateSchedule = useMutation({
    mutationFn: async (payload: {
      sourceName: string;
      advanceMonths: number;
      nextExpectedReleaseDate: string;
    }) => {
      const res = await fetch("/api/source-schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to update release schedule");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["source-schedules"] });
      queryClient.invalidateQueries({ queryKey: ["approval-month", reviewMonth] });
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : "Failed to update release schedule")
  });

  const mutateApproval = useMutation({
    mutationFn: async (payload: { sourceValueId: string; action: "approve" | "reject" | "edit"; value?: number; note?: string }) => {
      const res = await fetch("/api/approvals/source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to update approval");
      }
      return res.json();
    },
    onSuccess: async () => {
      await refetchApprovalMonth();
      queryClient.invalidateQueries({ queryKey: ["history"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
      setReviewNote("");
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : "Failed to update approval")
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

  const canGenerateDraft = contextComplete && !!approvalSnapshot?.allApproved;

  if (isLoading || !data) {
    return <p className="subtle">Loading automation workspace...</p>;
  }

  const previewHtml = buildPreviewHtml(draftHtml);

  return (
    <div className="space-y-10">
      <section className="card p-6 space-y-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="section-title">Monthly Workflow</h2>
            <p className="subtle">1) Run scrape, 2) review and approve all source values, 3) update context + generate draft, 4) edit and send.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="button-secondary" onClick={() => runIngest.mutate()} disabled={runIngest.isPending}>
              {runIngest.isPending ? "Running scrape..." : "Run scrape now"}
            </button>
            <button
              className="button-secondary"
              onClick={() => {
                if (!reviewMonth) return;
                setReviewOpen(true);
                refetchApprovalMonth();
              }}
              disabled={!reviewMonth}
            >
              Review month
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-ink-700">Review month</label>
          <input
            className="input w-40"
            value={reviewMonth}
            onChange={(event) => setReviewMonth(event.target.value)}
            placeholder="Feb 2026"
          />
          {approvalSnapshot ? (
            <p className={`text-sm ${approvalSnapshot.allApproved ? "text-moss-600" : "text-ember-600"}`}>
              {approvalSnapshot.allApproved
                ? `Approved (${approvalSnapshot.sourceCount}/${approvalSnapshot.sourceCount})`
                : `${approvalSnapshot.pendingCount} of ${approvalSnapshot.sourceCount} still pending approval`}
            </p>
          ) : (
            <p className="text-sm text-ink-600">No approval snapshot yet for this month.</p>
          )}
        </div>
        {actionError ? <p className="text-sm text-ember-600">{actionError}</p> : null}
        {actionSuccess ? <p className="text-sm text-moss-600">{actionSuccess}</p> : null}
      </section>

      <section className="card p-6 space-y-4">
        <div>
          <h2 className="section-title">Context + Draft Generation</h2>
          <p className="subtle mt-1">Draft generation is unlocked only when all source values for the selected month are approved.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <textarea className="textarea" value={context1} onChange={(e) => setContext1(e.target.value)} placeholder="Context 1" />
          <textarea className="textarea" value={context2} onChange={(e) => setContext2(e.target.value)} placeholder="Context 2" />
          <textarea className="textarea" value={context3} onChange={(e) => setContext3(e.target.value)} placeholder="Context 3" />
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            className="button-primary"
            onClick={() => generateDraft.mutate()}
            disabled={!canGenerateDraft || generateDraft.isPending}
          >
            {generateDraft.isPending ? "Generating draft..." : "Generate draft"}
          </button>
          {!approvalSnapshot?.allApproved ? (
            <p className="text-sm text-ember-600">Approve all source rows before generating a draft.</p>
          ) : null}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[2fr,3fr]">
        <div className="card p-6">
          <h2 className="section-title">Drafts</h2>
          <p className="subtle mt-1">Select a draft to edit and send manually.</p>
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
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="section-title">Draft Editor</h2>
              <p className="subtle mt-1">Edit the HTML content before sending.</p>
            </div>
            <div className="flex gap-2">
              <button
                className={editorMode === "edit" ? "button-primary" : "button-secondary"}
                onClick={() => setEditorMode("edit")}
              >
                Edit
              </button>
              <button
                className={editorMode === "preview" ? "button-primary" : "button-secondary"}
                onClick={() => setEditorMode("preview")}
              >
                Preview
              </button>
            </div>
          </div>
          {selectedDraft ? (
            <div className="mt-4 space-y-4">
              {editorMode === "edit" ? (
                <ReactQuill theme="snow" value={draftHtml} onChange={setDraftHtml} />
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-ink-600">
                    Preview reflects the HTML email layout. Rendering may vary slightly by email client.
                  </p>
                  <div className="email-preview">
                    <iframe className="email-preview-frame" title="Email preview" srcDoc={previewHtml} />
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-3">
                <button className="button-secondary" onClick={() => saveDraft.mutate()}>Save edits</button>
                <button
                  className="button-secondary"
                  onClick={() => {
                    if (!selectedDraft) return;
                    if (!window.confirm("Delete this draft? This cannot be undone.")) return;
                    deleteDraft.mutate(selectedDraft.id);
                  }}
                  disabled={deleteDraft.isPending}
                >
                  {deleteDraft.isPending ? "Deleting..." : "Delete draft"}
                </button>
              </div>
            </div>
          ) : (
            <p className="subtle mt-4">Select a draft to begin editing.</p>
          )}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="card p-6">
          <h2 className="section-title">Recipients</h2>
          <p className="subtle mt-1">Manage newsletter recipients and send draft manually after approval.</p>
          <div className="mt-4 space-y-3">
            <input className="input" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} placeholder="Email" />
            <input className="input" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Name (optional)" />
            <button className="button-secondary" onClick={() => addRecipient.mutate()}>Add recipient</button>
          </div>
          <ul className="mt-4 space-y-2 text-sm max-h-64 overflow-auto">
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
                  <div className="flex items-center gap-2">
                    <span className="subtle">{recipient.name ?? ""}</span>
                    <button className="text-xs text-ember-600" onClick={() => removeRecipient.mutate(recipient.id)}>
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-6 border-t border-sand-200 pt-4">
            <h3 className="font-semibold text-ink-900">Send Draft Now</h3>
            <p className="subtle mt-1">All send modes are blocked until approvals are complete for the draft month.</p>
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
              <button
                className="button-primary"
                onClick={() => sendNow.mutate()}
                disabled={!canSendNow || !sendApprovalReady}
              >
                Send draft now
              </button>
              {!sendApprovalReady ? (
                <p className="text-xs text-ember-600">Complete approvals for this draft month before sending.</p>
              ) : null}
              {sendError ? <p className="text-sm text-ember-600">{sendError}</p> : null}
              {sendSuccess ? <p className="text-sm text-moss-600">{sendSuccess}</p> : null}
            </div>
          </div>
        </div>

        <div className="card p-6">
          <h2 className="section-title">Approval Recipients</h2>
          <p className="subtle mt-1">These users receive monthly approval-request emails.</p>
          <div className="mt-4 flex gap-2">
            <input
              className="input"
              value={approverEmail}
              onChange={(e) => setApproverEmail(e.target.value)}
              placeholder="Approver user email"
            />
            <button className="button-secondary" onClick={() => addApprover.mutate()}>
              Add
            </button>
          </div>
          <ul className="mt-4 space-y-2 text-sm">
            {approvalRecipientsData?.recipients?.map((recipient) => (
              <li key={recipient.id} className="flex items-center justify-between border-b border-sand-200 pb-2">
                <span>{recipient.email}</span>
                <button className="text-xs text-ember-600" onClick={() => removeApprover.mutate(recipient.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="card p-6">
          <h2 className="section-title">Sent Emails</h2>
          <p className="subtle mt-1">Recent manual send activity.</p>
          {data.sendLogs.length ? (
            <ul className="mt-4 space-y-3 text-sm">
              {data.sendLogs.map((log) => {
                const statusTone = log.status === "SENT" ? "text-moss-600" : "text-ember-600";
                const recipients =
                  log.recipientCount !== null && log.recipientCount !== undefined
                    ? `${log.recipientCount} recipients`
                    : log.recipientEmail
                      ? log.recipientEmail
                      : "Recipients n/a";
                const detail =
                  log.status === "FAILED"
                    ? `Failed ${new Date(log.createdAt).toLocaleString()}`
                    : `Sent ${new Date(log.createdAt).toLocaleString()}`;
                return (
                  <li key={log.id} className="border-b border-sand-200 pb-2">
                    <div className="flex items-center justify-between">
                      <span>{log.month}</span>
                      <span className={statusTone}>{log.status}</span>
                    </div>
                    <p className="subtle text-xs mt-1">
                      {log.mode} · {recipients}
                    </p>
                    <p className="subtle text-xs">{detail}</p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="subtle mt-4 text-sm">No send activity yet.</p>
          )}
        </div>
      </section>

      <section className="card p-6">
        <h2 className="section-title">Source Release Schedules</h2>
        <p className="subtle mt-1">Manage recurring release timing and exact next expected release date per source.</p>
        <div className="mt-4 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-600">
                <th className="py-2">Source</th>
                <th className="py-2">Cadence</th>
                <th className="py-2">Advance (months)</th>
                <th className="py-2">Next expected release</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {sourceSchedulesData?.schedules?.map((schedule) => (
                <ScheduleRow key={schedule.sourceName} schedule={schedule} onSave={updateSchedule.mutate} />
              ))}
            </tbody>
          </table>
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
          <div className="card max-h-[90vh] w-full max-w-6xl overflow-auto p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="section-title">Review and Approve Source Values</h3>
                <p className="subtle mt-1">Every row must be approved before draft generation and sending.</p>
              </div>
              <button className="button-secondary" onClick={() => setReviewOpen(false)}>
                Close
              </button>
            </div>

            {approvalSnapshot ? (
              <>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <p className="text-sm font-semibold text-ink-900">{approvalSnapshot.month}</p>
                  <p className={`text-sm ${approvalSnapshot.allApproved ? "text-moss-600" : "text-ember-600"}`}>
                    {approvalSnapshot.allApproved
                      ? "All rows approved"
                      : `${approvalSnapshot.pendingCount} row(s) still pending`}
                  </p>
                </div>
                <div className="mt-4 overflow-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-ink-600">
                        <th className="py-2">Source</th>
                        <th className="py-2">Value</th>
                        <th className="py-2">Prev</th>
                        <th className="py-2">Delta</th>
                        <th className="py-2">Expected Release</th>
                        <th className="py-2">Status</th>
                        <th className="py-2">Approval</th>
                        <th className="py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {approvalSnapshot.rows.map((row) => (
                        <tr key={row.id} className="border-t border-sand-200 align-top">
                          <td className="py-2 pr-3">
                            <p className="font-medium text-ink-900">{row.sourceName}</p>
                            <a className="text-xs text-ink-700 underline" href={row.sourceUrl} target="_blank" rel="noreferrer">
                              Source
                            </a>
                          </td>
                          <td className="py-2">
                            <div className="flex gap-2">
                              <input
                                className="input w-28"
                                type="number"
                                step="0.1"
                                value={reviewEdits[row.id] ?? ""}
                                onChange={(e) => setReviewEdits((prev) => ({ ...prev, [row.id]: e.target.value }))}
                              />
                              <button
                                className="button-secondary"
                                onClick={() => {
                                  const numeric = Number(reviewEdits[row.id]);
                                  if (!Number.isFinite(numeric)) return;
                                  mutateApproval.mutate({
                                    sourceValueId: row.id,
                                    action: "edit",
                                    value: numeric,
                                    note: reviewNote || undefined
                                  });
                                }}
                              >
                                Save
                              </button>
                            </div>
                          </td>
                          <td className="py-2 text-ink-700">{row.previousValue ?? "—"}</td>
                          <td className="py-2 text-ink-700">{row.delta ?? "—"}</td>
                          <td className="py-2 text-xs">
                            <p className={row.dueState === "PAST_DUE" ? "text-ember-600" : "text-ink-700"}>{row.dueLabel}</p>
                            {row.carriedForward ? <p className="text-ember-600">Carried forward</p> : null}
                          </td>
                          <td className="py-2 text-xs text-ink-700">{row.message ?? row.status}</td>
                          <td className="py-2 text-xs">
                            <p className={row.approvalStatus === "APPROVED" ? "text-moss-600" : "text-ember-600"}>
                              {row.approvalStatus}
                            </p>
                            {row.approvedBy ? <p className="text-ink-600">{row.approvedBy.email}</p> : null}
                          </td>
                          <td className="py-2">
                            <div className="flex gap-2">
                              <button
                                className="button-secondary"
                                onClick={() => mutateApproval.mutate({ sourceValueId: row.id, action: "approve", note: reviewNote || undefined })}
                              >
                                Approve
                              </button>
                              <button
                                className="button-secondary"
                                onClick={() => mutateApproval.mutate({ sourceValueId: row.id, action: "reject", note: reviewNote || undefined })}
                              >
                                Reject
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4">
                  <label className="text-sm text-ink-700">
                    Optional note for next action
                    <input
                      className="input mt-1"
                      value={reviewNote}
                      onChange={(event) => setReviewNote(event.target.value)}
                      placeholder="Reason, caveat, or review note"
                    />
                  </label>
                </div>
              </>
            ) : (
              <p className="subtle mt-4">No ingest snapshot found for this month.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function buildPreviewHtml(html: string) {
  if (!html) return "";
  const hasHtmlTag = /<html[\s>]/i.test(html);
  if (hasHtmlTag) return html;
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { margin: 0; padding: 24px; background: #f7f2ed; }
      table { border-collapse: collapse; }
    </style>
  </head>
  <body>
    ${html}
  </body>
</html>`;
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

  useEffect(() => {
    setValue(weight?.toString() ?? "");
  }, [weight]);

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

function ScheduleRow({
  schedule,
  onSave
}: {
  schedule: SourceSchedule;
  onSave: (payload: { sourceName: string; advanceMonths: number; nextExpectedReleaseDate: string }) => void;
}) {
  const [advanceMonths, setAdvanceMonths] = useState(String(schedule.advanceMonths));
  const [nextExpectedReleaseDate, setNextExpectedReleaseDate] = useState(toDateInput(schedule.nextExpectedReleaseDate));

  useEffect(() => {
    setAdvanceMonths(String(schedule.advanceMonths));
    setNextExpectedReleaseDate(toDateInput(schedule.nextExpectedReleaseDate));
  }, [schedule.advanceMonths, schedule.nextExpectedReleaseDate]);

  return (
    <tr className="border-t border-sand-200">
      <td className="py-2 pr-4">
        <p className="font-medium text-ink-900">{schedule.sourceName}</p>
        <a className="text-xs text-ink-700 underline" href={schedule.sourceUrl} target="_blank" rel="noreferrer">
          Source
        </a>
      </td>
      <td className="py-2 text-xs uppercase tracking-[0.2em] text-ink-700">{schedule.releaseCadence}</td>
      <td className="py-2">
        <input
          className="input w-20"
          type="number"
          min={1}
          step={1}
          value={advanceMonths}
          onChange={(event) => setAdvanceMonths(event.target.value)}
        />
      </td>
      <td className="py-2">
        <input
          className="input"
          type="date"
          value={nextExpectedReleaseDate}
          onChange={(event) => setNextExpectedReleaseDate(event.target.value)}
        />
      </td>
      <td className="py-2 text-right">
        <button
          className="button-secondary"
          onClick={() => {
            const numericAdvanceMonths = Number(advanceMonths);
            if (!Number.isFinite(numericAdvanceMonths) || numericAdvanceMonths < 1 || !nextExpectedReleaseDate) {
              return;
            }
            onSave({
              sourceName: schedule.sourceName,
              advanceMonths: numericAdvanceMonths,
              nextExpectedReleaseDate: new Date(`${nextExpectedReleaseDate}T12:00:00.000Z`).toISOString()
            });
          }}
        >
          Save
        </button>
      </td>
    </tr>
  );
}
