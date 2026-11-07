import { useCallback, useEffect, useId, useRef, useState } from "react";
import { z } from "zod";
import { ArrowLeft, CarFront, MessageCircle, RefreshCw, Send, UserRound } from "lucide-react";
import { getMealDeckOpsClient } from "@/lib/mealdeck-ops-browser";
import { normaliseOrderNotes, MAX_ORDER_NOTES_LENGTH } from "@/lib/mealdeck-order-notes";
import { findLaunchMenuItem, launchSelectionLabels } from "@/lib/launch-menu-picks";
import "./whatsapp-inbox-panel.css";

import {
  parseWhatsAppInbox,
  prepareWhatsAppStaffReply,
  readWhatsAppPendingReply,
  forgetPendingReply,
  replyStatus,
  whatsAppReplyStorageKey,
  type WhatsAppInboxSession,
  type PendingReply,
  type InboxScope,
} from "@/lib/mealdeck-whatsapp-inbox-browser";

function readableTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

const statusLabels = {
  payment_pending: "Payment not yet confirmed",
  paid: "Paid · awaiting kitchen acceptance",
  accepted: "Accepted by the kitchen",
  ready: "Ready for collection",
  completed: "Collected",
  held: "Order needs review",
};
const replyLabels = {
  queued: "Queued",
  sending: "Sending",
  sent: "Sent to WhatsApp",
  held: "Held for review",
  cancelled: "Cancelled",
};
const reasonLabels: Record<string, string> = {
  allergen: "Allergen question",
  allergens: "Allergen question",
  allergy: "Allergen question",
  refund: "Refund request",
  payment: "Payment question",
  payment_dispute: "Payment dispute",
  human_requested: "Customer requested staff",
  staff_requested: "Customer requested staff",
  unsupported_media: "Attachment needs review",
  session_window_closed: "Customer reply window closed",
  send_uncertain: "Message outcome needs checking",
  provider_rejected: "WhatsApp rejected the message",
};

export function WhatsAppInboxConversation({
  session,
  staffUserId,
}: {
  session: WhatsAppInboxSession;
  staffUserId: string;
}) {
  const draft = session.draft;
  const order = session.orderBinding;
  const messages = [
    ...session.recentMessages.map((entry) => ({
      id: entry.eventId,
      at: entry.receivedAt,
      direction: "Customer",
      status: "",
      text:
        entry.input.text ||
        (entry.input.unsupported
          ? "Attachment or message type needs staff review."
          : entry.input.actionId
            ? "Customer selected a menu or conversation option."
            : "This message body is no longer retained."),
    })),
    ...session.recentReplies.map((entry) => ({
      id: entry.id,
      at: entry.createdAt,
      direction: "MealDeck",
      status: replyLabels[entry.status],
      text: entry.reply.text || "Secure checkout link or message body is not displayed here.",
    })),
  ].sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
  return (
    <>
      <div className="md-whatsapp-inbox-contact">
        <h3>{draft.customer?.name || "WhatsApp customer"}</h3>
        {draft.customer?.phone && <p>{draft.customer.phone}</p>}
        <p className="md-ops-muted">
          {session.mode === "staff"
            ? session.assignedTo === staffUserId
              ? "You are handling this conversation."
              : "Another staff member is handling this conversation."
            : session.mode === "support"
              ? "Waiting for a member of the team."
              : "The assistant is handling this conversation."}
        </p>
      </div>
      {session.supportReason && (
        <p className="md-ops-status">
          {reasonLabels[session.supportReason] ?? "The conversation needs a staff review."}
        </p>
      )}
      {order && (
        <div className="md-whatsapp-inbox-order">
          <strong>
            {order.status === "held"
              ? statusLabels.held
              : order.verifiedPaid
                ? statusLabels[order.status]
                : statusLabels.payment_pending}
          </strong>
          <span>{order.fulfilment === "curbside" ? "Kerbside pickup" : "Counter collection"}</span>
          {order.arrivedAt && (
            <p>
              <CarFront size={18} aria-hidden="true" />
              Customer reports arrival · {readableTime(order.arrivedAt)}
            </p>
          )}
        </div>
      )}
      {draft.vehicle && (
        <p className="md-whatsapp-inbox-car">
          <CarFront size={18} aria-hidden="true" />
          {draft.vehicle.colour} {draft.vehicle.make} · Registration ending{" "}
          {draft.vehicle.registrationLast4 || "not provided"}
        </p>
      )}
      {!!draft.picks?.length && (
        <details className="md-whatsapp-inbox-draft">
          <summary>Choices from the conversation</summary>
          <p className="md-ops-muted">
            Check the kitchen board for the paid order and its final packing.
          </p>
          <ul>
            {draft.picks.map((pick, index) => {
              const found = findLaunchMenuItem(pick.brandId, pick.itemId);
              return (
                <li key={index}>
                  <strong>
                    {pick.quantity} × {found?.item.name ?? "Menu choice"}
                  </strong>
                  {found && (
                    <span>
                      {launchSelectionLabels(found.brand, found.item, pick.selections ?? {}).join(
                        " · ",
                      )}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {draft.notes && (
            <p className="md-whatsapp-inbox-message-text">Special requests: {draft.notes}</p>
          )}
        </details>
      )}
      <section className="md-whatsapp-inbox-messages" aria-label="Recent conversation">
        <h4>Recent conversation</h4>
        {messages.length === 0 ? (
          <p className="md-ops-muted">No retained messages are available.</p>
        ) : (
          <ol>
            {messages.map((message) => (
              <li key={message.direction + message.id} data-direction={message.direction}>
                <div>
                  <strong>{message.direction}</strong>
                  <time dateTime={message.at}>{readableTime(message.at)}</time>
                </div>
                <p className="md-whatsapp-inbox-message-text">{message.text}</p>
                {message.status && <small>{message.status}</small>}
              </li>
            ))}
          </ol>
        )}
      </section>
      {session.heldReplies.length > 0 && (
        <section className="md-whatsapp-inbox-held" aria-label="Replies held for review">
          <h4>Replies held for review</h4>
          <p>
            Check the conversation before replying. A held message has not been confirmed as sent.
          </p>
          <ul>
            {session.heldReplies.map((reply) => (
              <li key={reply.id}>
                <strong>
                  {reply.reason
                    ? (reasonLabels[reply.reason] ?? "Needs staff review")
                    : "Needs staff review"}
                </strong>
                <p className="md-whatsapp-inbox-message-text">
                  {reply.reply.text || "Secure checkout message"}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

type InboxAction =
  | { action: "inbox" }
  | { action: "takeover" | "release"; sessionId: string }
  | { action: "reply"; sessionId: string; text: string; requestId: string };

export function WhatsAppInboxPanel({
  tenantId,
  locationId,
  staffUserId,
  canControl,
}: InboxScope & { canControl: boolean }) {
  const scopeKey = [tenantId, locationId, staffUserId].join(":");
  const scopeRef = useRef(scopeKey);
  scopeRef.current = scopeKey;
  const titleId = useId();
  const [report, setReport] = useState<{
    scope: string;
    data: NonNullable<ReturnType<typeof parseWhatsAppInbox>>;
  } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<PendingReply | null>(null);
  const [replyFrozen, setReplyFrozen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const polling = useRef(false);
  const mutating = useRef(false);
  const detailHeading = useRef<HTMLDivElement>(null);

  const request = useCallback(
    async (action: InboxAction) => {
      const client = getMealDeckOpsClient();
      const session = await client.auth.getSession();
      if (
        session.error ||
        !session.data.session ||
        session.data.session.user.id !== staffUserId ||
        scopeRef.current !== scopeKey
      )
        throw new Error("Your staff account changed. Sign in again to use WhatsApp conversations.");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12_000);
      try {
        // The bearer is transport only; the endpoint re-verifies identity, MFA and kitchen permissions.
        const response = await fetch("/api/ops/whatsapp", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          referrerPolicy: "no-referrer",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + session.data.session.access_token,
          },
          body: JSON.stringify({ ...action, tenantId, locationId }),
          signal: controller.signal,
        });
        const body: unknown = await response.json();
        const current = await client.auth.getSession();
        if (
          getMealDeckOpsClient() !== client ||
          current.error ||
          current.data.session?.user.id !== staffUserId ||
          scopeRef.current !== scopeKey
        )
          throw new Error(
            "Your staff account changed. Sign in again to use WhatsApp conversations.",
          );
        if (!response.ok)
          throw new Error(
            response.status === 401
              ? "Sign in again to use WhatsApp conversations."
              : response.status === 403
                ? "Your current staff permissions do not allow this action."
                : response.status === 409
                  ? "The conversation changed. Refresh it and check your takeover and the customer reply window."
                  : "WhatsApp conversations could not be updated. Check the connection and try again.",
          );
        return body;
      } finally {
        clearTimeout(timeout);
      }
    },
    [tenantId, locationId, staffUserId, scopeKey],
  );

  const refresh = useCallback(async () => {
    if (polling.current || mutating.current || document.visibilityState === "hidden") return;
    polling.current = true;
    const current = ++generation.current;
    setLoading(true);
    try {
      const result = parseWhatsAppInbox(await request({ action: "inbox" }));
      if (!result) throw new Error("The conversation list could not be verified. Please refresh.");
      if (current === generation.current) {
        setReport({ scope: scopeKey, data: result });
        setError("");
      }
    } catch (reason) {
      if (current === generation.current) {
        setReport(null);
        setError(
          reason instanceof Error && reason.name !== "AbortError"
            ? reason.message
            : "WhatsApp conversations could not connect. Please refresh.",
        );
      }
    } finally {
      polling.current = false;
      if (current === generation.current) setLoading(false);
    }
  }, [request, scopeKey]);

  useEffect(() => {
    setReport(null);
    setSelectedId(null);
    setDrafts({});
    setPending(null);
    setReplyFrozen(false);
    setBusy(false);
    setLoading(false);
    setError("");
    setNotice("");
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 15_000);
    const visible = () => {
      if (document.visibilityState !== "hidden") void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    let unsubscribe: (() => void) | undefined;
    try {
      const subscription = getMealDeckOpsClient().auth.onAuthStateChange((_event, session) => {
        if (session?.user.id === staffUserId) return;
        generation.current += 1;
        setReport(null);
        setSelectedId(null);
        setDrafts({});
        setPending(null);
        setReplyFrozen(false);
        setBusy(false);
        setLoading(false);
        setError("Your staff account changed. Sign in again to use WhatsApp conversations.");
      });
      unsubscribe = () => subscription.data.subscription.unsubscribe();
    } catch {
      /* The request displays the connection problem. */
    }
    return () => {
      generation.current += 1;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
      unsubscribe?.();
    };
  }, [refresh, staffUserId]);

  const current = report?.scope === scopeKey ? report.data : null;
  const selected = current?.sessions.find((entry) => entry.sessionId === selectedId) ?? null;
  const owned = selected?.mode === "staff" && selected.assignedTo === staffUserId;
  const otherStaff = !!selected?.assignedTo && selected.assignedTo !== staffUserId;
  const text = selected ? (drafts[selected.sessionId] ?? "") : "";
  const textValid = (() => {
    try {
      return !!normaliseOrderNotes(text);
    } catch {
      return false;
    }
  })();
  const replyWindowClosed = selected
    ? Date.now() - Date.parse(selected.lastInboundAt) >= 86_400_000
    : false;

  useEffect(() => {
    setNotice("");
    setReplyFrozen(false);
    if (!selectedId) {
      setPending(null);
      return;
    }
    try {
      setPending(
        readWhatsAppPendingReply(
          sessionStorage,
          whatsAppReplyStorageKey({ tenantId, locationId, staffUserId }, selectedId),
        ),
      );
    } catch {
      setPending(null);
    }
    detailHeading.current?.focus();
  }, [selectedId, tenantId, locationId, staffUserId]);

  useEffect(() => {
    if (!pending || !selected) return;
    const confirmed = selected.recentReplies.find((reply) => reply.requestId === pending.requestId);
    if (!confirmed) return;
    try {
      forgetPendingReply(
        sessionStorage,
        whatsAppReplyStorageKey({ tenantId, locationId, staffUserId }, selected.sessionId),
        pending.requestId,
      );
    } catch {
      /* The server acknowledgement is still authoritative. */
    }
    setPending(null);
    setReplyFrozen(false);
    setDrafts((values) => ({ ...values, [selected.sessionId]: "" }));
    setNotice("Your previous reply is recorded: " + replyLabels[confirmed.status] + ".");
  }, [pending, selected, tenantId, locationId, staffUserId]);

  async function changeConversation(action: "takeover" | "release" | "reply") {
    if (
      !selected ||
      !canControl ||
      mutating.current ||
      otherStaff ||
      (action !== "takeover" && !owned)
    )
      return;
    const sessionId = selected.sessionId;
    mutating.current = true;
    const operation = ++generation.current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      let input: InboxAction;
      let outgoing: Awaited<ReturnType<typeof prepareWhatsAppStaffReply>> | null = null;
      const key = whatsAppReplyStorageKey({ tenantId, locationId, staffUserId }, sessionId);
      if (action === "reply") {
        outgoing = await prepareWhatsAppStaffReply(sessionStorage, key, text);
        if (operation !== generation.current) return;
        setPending({ requestId: outgoing.requestId, textHash: outgoing.textHash });
        setReplyFrozen(true);
        input = { action, sessionId, text: outgoing.text, requestId: outgoing.requestId };
      } else input = { action, sessionId };
      const applied = z
        .object({ applied: z.literal(true), status: replyStatus.optional() })
        .safeParse(await request(input));
      if (!applied.success)
        throw new Error(
          "The update could not be confirmed. Refresh the conversation before trying again.",
        );
      if (operation !== generation.current) return;
      if (outgoing) {
        try {
          forgetPendingReply(sessionStorage, key, outgoing.requestId);
        } catch {
          /* Current acknowledgement remains valid. */
        }
        setPending(null);
        setReplyFrozen(false);
        setDrafts((values) => ({ ...values, [sessionId]: "" }));
        setNotice(
          "Reply " +
            (applied.data.status ? replyLabels[applied.data.status].toLowerCase() : "queued") +
            ". Delivery is confirmed separately by WhatsApp.",
        );
      } else
        setNotice(
          action === "takeover"
            ? "You are now handling this conversation. The assistant is paused."
            : "Conversation returned to the assistant.",
        );
      const result = parseWhatsAppInbox(await request({ action: "inbox" }));
      if (!result)
        throw new Error("The updated conversation could not be verified. Please refresh.");
      if (operation === generation.current) setReport({ scope: scopeKey, data: result });
    } catch (reason) {
      if (operation === generation.current) {
        setReport(null);
        setError(
          reason instanceof Error && reason.name !== "AbortError"
            ? reason.message
            : "The update could not be confirmed. Refresh, or retry the same reply.",
        );
      }
    } finally {
      mutating.current = false;
      if (operation === generation.current) {
        setBusy(false);
        setLoading(false);
      }
    }
  }

  if (current?.configured === false || (!current && !error)) return null;
  return (
    <section className="md-ops-card md-whatsapp-inbox" aria-labelledby={titleId}>
      <header className="md-whatsapp-inbox-header">
        <div>
          <h2 id={titleId}>
            <MessageCircle size={23} aria-hidden="true" />
            WhatsApp conversations
          </h2>
          <p className="md-ops-muted">
            Staff handovers, customer arrivals and replies needing attention.
          </p>
        </div>
        <button
          type="button"
          className="md-ops-button md-ops-secondary"
          disabled={loading || busy}
          onClick={() => {
            void refresh();
          }}
        >
          <RefreshCw
            size={16}
            className={loading ? "animate-spin motion-reduce:animate-none" : ""}
            aria-hidden="true"
          />
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </header>
      {error && (
        <p className="md-ops-status md-ops-status-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="md-ops-status" role="status">
          {notice}
        </p>
      )}
      {current?.sessions.length === 0 ? (
        <p className="md-ops-empty p-5">No WhatsApp conversations need attention right now.</p>
      ) : (
        current && (
          <div className="md-whatsapp-inbox-layout" data-open={!!selected}>
            <nav className="md-whatsapp-inbox-list" aria-label="Conversations needing attention">
              {current.sessions.map((entry) => (
                <button
                  key={entry.sessionId}
                  type="button"
                  disabled={busy}
                  aria-current={selected?.sessionId === entry.sessionId ? "true" : undefined}
                  onClick={() => setSelectedId(entry.sessionId)}
                >
                  <strong>{entry.draft.customer?.name || "WhatsApp customer"}</strong>
                  <span>
                    {entry.orderBinding?.arrivedAt
                      ? "Customer reports arrival"
                      : entry.mode === "staff"
                        ? entry.assignedTo === staffUserId
                          ? "With you"
                          : "With another staff member"
                        : entry.mode === "support"
                          ? "Waiting for staff"
                          : "Assistant conversation"}
                  </span>
                  {entry.heldReplies.length > 0 && (
                    <span className="md-whatsapp-inbox-attention">
                      {entry.heldReplies.length} held{" "}
                      {entry.heldReplies.length === 1 ? "reply" : "replies"}
                    </span>
                  )}
                  <time dateTime={entry.lastInboundAt}>{readableTime(entry.lastInboundAt)}</time>
                </button>
              ))}
            </nav>
            <div className="md-whatsapp-inbox-detail" ref={detailHeading} tabIndex={-1}>
              {!selected ? (
                <p className="md-ops-muted">
                  Choose a conversation to review the messages and linked order.
                </p>
              ) : (
                <>
                  <button
                    type="button"
                    className="md-ops-button md-ops-secondary md-whatsapp-inbox-back"
                    disabled={busy}
                    onClick={() => setSelectedId(null)}
                  >
                    <ArrowLeft size={16} aria-hidden="true" />
                    Conversations
                  </button>
                  <WhatsAppInboxConversation session={selected} staffUserId={staffUserId} />
                  {canControl ? (
                    <div className="md-whatsapp-inbox-controls">
                      {owned ? (
                        <>
                          {replyWindowClosed ? (
                            <p className="md-ops-status">
                              The customer reply window has closed. Wait for a new customer message
                              before sending a free-text reply.
                            </p>
                          ) : (
                            <form
                              onSubmit={(event) => {
                                event.preventDefault();
                                void changeConversation("reply");
                              }}
                            >
                              <label htmlFor={titleId + "-reply"}>Your reply</label>
                              <textarea
                                id={titleId + "-reply"}
                                className="md-ops-field"
                                rows={4}
                                value={text}
                                disabled={busy}
                                readOnly={!!pending && replyFrozen}
                                maxLength={MAX_ORDER_NOTES_LENGTH * 2}
                                onChange={(event) =>
                                  setDrafts((values) => ({
                                    ...values,
                                    [selected.sessionId]: event.target.value,
                                  }))
                                }
                                aria-describedby={titleId + "-reply-help"}
                              />
                              <p id={titleId + "-reply-help"} className="md-ops-muted">
                                {[...text].length} / {MAX_ORDER_NOTES_LENGTH} characters. Check
                                allergens, payment questions and refunds with the appropriate team.
                              </p>
                              {pending && (
                                <p className="md-ops-status">
                                  A previous send has not been confirmed. Refresh to check its
                                  status, or retry exactly the same reply. After reopening this
                                  screen, re-enter the original text.
                                </p>
                              )}
                              <button
                                type="submit"
                                className="md-ops-button md-ops-primary"
                                disabled={busy || !textValid}
                              >
                                <Send size={17} aria-hidden="true" />
                                {busy ? "Updating…" : pending ? "Retry same reply" : "Send reply"}
                              </button>
                            </form>
                          )}
                          <button
                            type="button"
                            className="md-ops-button md-ops-secondary"
                            disabled={busy || !!pending}
                            onClick={() => {
                              void changeConversation("release");
                            }}
                          >
                            Return to assistant
                          </button>
                        </>
                      ) : otherStaff ? (
                        <p className="md-ops-muted">
                          Ask the assigned staff member to release this conversation before taking
                          over.
                        </p>
                      ) : (
                        <button
                          type="button"
                          className="md-ops-button md-ops-primary"
                          disabled={busy}
                          onClick={() => {
                            void changeConversation("takeover");
                          }}
                        >
                          <UserRound size={18} aria-hidden="true" />
                          Take over conversation
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="md-ops-muted">
                      You can review conversations. Replying and takeover require order status
                      permissions.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        )
      )}
    </section>
  );
}
