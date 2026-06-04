# AI Assist Plan — PLMun Nexus

Where AI can genuinely help the system, ordered by **value ÷ risk**. This is a
proposal for discussion — nothing here is built yet.

## Guiding principle (non-negotiable)

**AI suggests; humans decide.** Anything with a side effect or an authorization
decision (approve/reject, status change, role/access change, delete, send) stays
a human click. AI stays **read-only by default** — exactly like today's Messages
assistant. Any future AI "action" must go through the *same* permission checks +
audit log a human action does, be **config-gated** (off by default), and be
**rate-limited** (ties into P1 N3). Local Ollama in dev (PII never leaves the
box), Gemini in prod.

What AI must **never** do autonomously: approve/reject requests, change
access_level or roles, delete/clear data, confirm a return, send on a user's
behalf without confirmation.

---

## Tier 1 — Advisory, read-only (safe, high value) → recommended first

These extend the existing assistant (`apps/messaging/assistant.py`) and the
"refer an item" pattern. No new authority, no automation.

- **AI request triage insight** ⭐ *best starting point*
  On a pending request, a "AI insight" panel that summarizes and **flags risk**
  for the staff reviewer — e.g. *"Requester has 2 unreturned overdue items;
  requested qty 50 vs typical 1–3; stock would drop to 0."* Ends with a
  **suggested action + reasoning**. Staff still clicks Approve/Reject.
  - Reuses role-scoped data already in `build_context`; add a per-request prompt.
  - Pure read-only; the suggestion is advisory text.

- **Anomaly / abuse flagging** — surface unusual requests (huge qty, rapid
  re-requests, flagged-user activity) as a staff review queue. Rule-based first,
  AI explanation layered on top.

- **Inventory add-assist** — when staff add an item, AI suggests
  category / brand / description from the name (staff edits before saving).
  Cuts data-entry time; still a human save.

- **Natural-language analytics** ("how many projectors are overdue this month?")
  — extends the current assistant with the new aggregate endpoints.

## Tier 2 — AI-assisted, human-in-the-loop (medium risk, gated)

- **Draft replies for staff** in Messages — AI drafts a response; staff edits +
  sends. (Today's offline auto-reply already does a constrained version.)
- **Priority suggestion** on new requests (AI proposes HIGH/MED/LOW from item +
  purpose; staff can override). Currently priority is inherited from the item.
- **Overdue-reminder personalization** — the scheduled scan already sends
  reminders; AI could tailor wording. Low value, do last.

## Tier 3 — Guarded automation (higher risk — only with explicit rules + audit)

- **Rule-based auto-approve** for provably-safe requests (e.g. consumable, qty ≤
  N, stock available, requester not flagged, access_level OK). **Decision is the
  rule, not the AI** — AI may rank/explain, but the gate is deterministic code,
  audited, staff-toggleable, with a daily cap. Recommend deferring until Tier 1
  is proven and trusted.

---

## How it fits the current architecture

- **Provider**: same `ASSISTANT_PROVIDER` switch (ollama/gemini), `OLLAMA_TIMEOUT`,
  `num_ctx`. Triage/insight calls are short prompts → cheap on the 6 GB GPU.
- **Endpoints**: new read-only endpoints (e.g. `POST /requests/{id}/ai_insight/`)
  that 1) check the same permissions, 2) build role-scoped context, 3) return
  advisory text. **Must be rate-limited** (P1 N3) — AI endpoints are cost/DoS
  surface.
- **Audit**: log when an AI insight influenced a decision (the human action is
  still the audited event; note "AI-assisted" in details).
- **Scale (12k users / 10k req/mo)**: AI runs only on demand (staff opens a
  request), not per-list-load. Cache insights per request for a short TTL so
  re-opening doesn't re-call the model.

## Cost / safety controls

- Rate-limit per user + global (P1 N3) so a few staff can't exhaust the GPU/quota.
- Hard prompt-size cap (already `MAX_PROMPT_CHARS`).
- Never feed secrets/passwords/tokens to the model (system prompt already forbids;
  keep context to role-scoped business data only).
- Prod (Gemini) sends data to Google — add a one-line consent note in the UI if
  enabling cloud AI on real student data (already flagged as #26).

---

## Recommendation

Start with **Tier 1 → AI request-triage insight** (advisory, read-only, reuses
existing infra, immediately useful to staff, zero authority granted). Ship it
behind a setting, rate-limited, audited. Prove value + trust, then revisit Tier 2.

**Decision needed from you:** which Tier-1 feature to build first (triage insight
is my recommendation), and whether AI assist should be enabled in **dev only**
(Ollama) until you're comfortable, before any prod/Gemini exposure.
