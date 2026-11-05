import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  CreditCard,
  Loader2,
  Package,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { MealDeckLogo } from "@/components/mealdeck-logo";
import { getMealDeckCustomerAccessToken } from "@/lib/mealdeck-customer-browser";
import { formatLaunchMenuPrice } from "@/lib/launch-menu-display-prices";
import {
  sharedPaymentRoomPath,
  sharedPaymentUnclaimedPence,
  type SharedPaymentCapabilities,
  type SharedPaymentInviteLink,
  type SharedPaymentResult,
  type SharedPaymentResume,
  type SharedPaymentRoom,
  type SharedPaymentShare,
} from "@/lib/mealdeck-shared-payments";
import {
  parseSharedPaymentInvitation,
  readSharedPaymentCapabilities,
  rememberSharedPaymentRoom,
  requestSharedPayment,
  resolveSharedPaymentRoom,
  safeSharedPaymentCheckoutUrl,
  safeSharedPaymentInviteUrl,
} from "@/lib/mealdeck-shared-payments-browser";
import { PaymentIdentity } from "./payment-identity";
import { usePaymentIdentity } from "./use-payment-identity";
import "../../styles.mealdeck-group-payments.css";

const MAX_AUTOMATIC_UPDATES = 30;
const roomLabels: Record<SharedPaymentRoom["status"], string> = {
  awaiting_payment: "Waiting for payments",
  partially_paid: "Some payments received",
  paid: "All payments confirmed",
  cancelled: "Group order cancelled",
  expired: "Payment window closed",
  refund_review: "Payments need a refund review",
  hold: "Payment room on hold",
};
const shareLabels: Record<SharedPaymentShare["status"], string> = {
  unpaid: "Awaiting payment",
  processing: "Processing",
  paid: "Paid",
  refund_review: "Refund review",
  cancelled: "Cancelled",
};
const fundingOpen = (room: SharedPaymentRoom) =>
  room.status === "awaiting_payment" || room.status === "partially_paid";
const problemMessage = (problem: unknown) =>
  problem instanceof Error
    ? problem.message
    : "The payment room could not be updated. Please retry.";
const isAborted = (problem: unknown) => problem instanceof Error && problem.name === "AbortError";

function deadline(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function focusVisible(element: HTMLElement | null) {
  if (!element?.isConnected || !element.getClientRects().length || element.matches(":disabled"))
    return false;
  element.scrollIntoView({ block: "nearest" });
  element.focus({ preventScroll: true });
  return true;
}

function SharePaymentLink({ value, bagNumber }: { value: string; bagNumber: number }) {
  const [message, setMessage] = useState("");
  const [expanded, setExpanded] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setMessage("Link copied. Send it privately to the person with this bag.");
    } catch {
      setExpanded(true);
      setMessage("Select and copy the private link below.");
      requestAnimationFrame(() => {
        input.current?.focus();
        input.current?.select();
      });
    }
  }
  return (
    <div className="md-shared-invite">
      <button
        type="button"
        className="md-shared-button md-shared-button-light"
        onClick={() => {
          void copy();
        }}
      >
        <Copy size={17} aria-hidden="true" /> Copy Bag {bagNumber} payment link
      </button>
      <details open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
        <summary>View private link</summary>
        <label>
          Payment link for Bag {bagNumber}
          <textarea
            ref={input}
            value={value}
            readOnly
            rows={2}
            spellCheck={false}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      </details>
      <p className="md-shared-feedback" role="status">
        {message}
      </p>
    </div>
  );
}

function BagContents({ room, bagNumber }: { room: SharedPaymentRoom; bagNumber: number }) {
  const bag = room.bags.find((entry) => entry.number === bagNumber);
  if (!bag) return null;
  return (
    <ul className="md-shared-items">
      {bag.allocations.map((part) => {
        const line = room.lines.find((entry) => entry.lineId === part.lineId)!;
        return (
          <li key={part.lineId}>
            <strong>
              {part.quantity} × {line.name}
            </strong>
            {line.description && <p>{line.description}</p>}
          </li>
        );
      })}
    </ul>
  );
}

function RoomShares({
  room,
  invites,
  origin,
}: {
  room: SharedPaymentRoom;
  invites: SharedPaymentInviteLink[];
  origin: string;
}) {
  const ownId = room.viewer.shareId;
  const shares = [...room.shares].sort((left, right) =>
    left.shareId === ownId ? -1 : right.shareId === ownId ? 1 : left.bagNumber - right.bagNumber,
  );
  return (
    <section className="md-shared-card" aria-labelledby="shared-room-shares">
      <div className="md-shared-section-title">
        <Users size={23} aria-hidden="true" />
        <h2 id="shared-room-shares">
          {room.viewer.role === "organiser" ? "Your group’s shares" : "Your payment share"}
        </h2>
      </div>
      <p className="md-shared-muted">
        {room.splitMode === "equal"
          ? "The final order total is split equally. Any odd penny is included in the exact amounts shown."
          : "Each share covers the reviewed food in its numbered bag."}
      </p>
      {room.viewer.role === "organiser" ? (
        <p className="md-shared-muted">
          Send each person their own payment link. Keep these links private: anyone with a link can
          access that share.
        </p>
      ) : (
        <p className="md-shared-muted">
          Your link shows your share and the group’s overall funding progress. Other people’s
          contact details are private.
        </p>
      )}
      <div className="md-shared-share-list">
        {shares.map((share) => {
          const invite = invites.find(
            (entry) => entry.shareId === share.shareId && entry.bagNumber === share.bagNumber,
          );
          const url = invite
            ? safeSharedPaymentInviteUrl(invite.url, room.roomId, share.shareId, origin)
            : null;
          const own = share.shareId === ownId;
          return (
            <article
              key={share.shareId}
              className={"md-shared-share" + (own ? " md-shared-share-own" : "")}
            >
              <div className="md-shared-share-heading">
                <div>
                  <span className="md-shared-kicker">{own ? "Your share" : "Payment share"}</span>
                  <h3>Bag {share.bagNumber}</h3>
                </div>
                <span className={"md-shared-status md-shared-status-" + share.status}>
                  {share.status === "paid" && <CheckCircle2 size={16} aria-hidden="true" />}
                  {share.status === "processing" && <Clock3 size={16} aria-hidden="true" />}
                  {shareLabels[share.status]}
                </span>
              </div>
              <dl className="md-shared-share-money">
                <div>
                  <dt>Share total</dt>
                  <dd>{formatLaunchMenuPrice(share.amountPence)}</dd>
                </div>
                <div>
                  <dt>Payment confirmed</dt>
                  <dd>{formatLaunchMenuPrice(share.paidPence)}</dd>
                </div>
              </dl>
              {share.status === "processing" && (
                <p className="md-shared-muted">
                  Waiting for payment confirmation. A return from the payment page does not confirm
                  that money was received.
                </p>
              )}
              {share.status === "refund_review" && (
                <p className="md-shared-notice">
                  This payment needs review. A refund is not confirmed until the payment service
                  records it.
                </p>
              )}
              <details className="md-shared-bag-details" open={own || room.shares.length === 1}>
                <summary>
                  <Package size={17} aria-hidden="true" /> Review Bag {share.bagNumber} food,
                  flavours &amp; extras
                </summary>
                <BagContents room={room} bagNumber={share.bagNumber} />
              </details>
              {room.viewer.role === "organiser" && url && (
                <SharePaymentLink value={url} bagNumber={share.bagNumber} />
              )}
              {room.viewer.role === "organiser" && invite && !url && (
                <p className="md-shared-error" role="alert">
                  This payment link could not be verified. Refresh the room before sharing it.
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function GroupPaymentRoom({ routeRoomId }: { routeRoomId?: string }) {
  const identity = usePaymentIdentity();
  const payerKey =
    identity.mode +
    ":" +
    (identity.mode === "guest"
      ? (identity.guest?.session?.id ?? "no-guest")
      : identity.account?.status === "signed_in"
        ? identity.account.profile.userId
        : "no-member");
  const [room, setRoom] = useState<SharedPaymentRoom | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [invites, setInvites] = useState<SharedPaymentInviteLink[]>([]);
  const [resumePayments, setResumePayments] = useState<SharedPaymentResume[]>([]);
  const [resultPayerKey, setResultPayerKey] = useState("");
  const [capabilities, setCapabilities] = useState<SharedPaymentCapabilities | null>(null);
  const [origin, setOrigin] = useState("");
  const [loading, setLoading] = useState(true);
  const [fresh, setFresh] = useState(false);
  const [issue, setIssue] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [automaticPaused, setAutomaticPaused] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [locationVersion, setLocationVersion] = useState(0);
  const [dialog, setDialog] = useState<"pay" | "resume" | "cancel" | null>(null);
  const [dialogIssue, setDialogIssue] = useState("");
  const [selectedResume, setSelectedResume] = useState<SharedPaymentResume | null>(null);
  const [resumeReviewed, setResumeReviewed] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const dialogOpener = useRef<HTMLElement | null>(null);
  const mounted = useRef(true);
  const currentRoom = useRef<SharedPaymentRoom | null>(null);
  const mutating = useRef(false);
  const version = useRef(0);
  const readController = useRef<AbortController | null>(null);
  const mutationController = useRef<AbortController | null>(null);
  const paymentAttempt = useRef<{ key: string; id: string } | null>(null);
  const previousReviewKey = useRef("");

  const acceptResult = useCallback(
    (result: SharedPaymentResult) => {
      const sameOrganiserRoom =
        currentRoom.current?.roomId === result.room.roomId &&
        result.room.viewer.role === "organiser";
      currentRoom.current = result.room;
      setRoom(result.room);
      setInvites((current) => result.inviteLinks ?? (sameOrganiserRoom ? current : []));
      // Resume authority is never retained when a fresh response omits it, and
      // belongs only to the payer identity used for that response.
      setResumePayments(result.resumePayments ?? []);
      setResultPayerKey(payerKey);
      rememberSharedPaymentRoom(result.room.roomId);
      setFresh(true);
      setIssue("");
    },
    [payerKey],
  );

  useEffect(() => {
    mounted.current = true;
    const changed = () => setLocationVersion((value) => value + 1);
    window.addEventListener("hashchange", changed);
    return () => {
      mounted.current = false;
      version.current += 1;
      readController.current?.abort();
      mutationController.current?.abort();
      window.removeEventListener("hashchange", changed);
    };
  }, []);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let updates = 0;
    let selectedId: string | null = null;
    const capabilityController = new AbortController();
    setLoading(true);
    setFresh(false);
    setIssue("");
    setAutomaticPaused(false);
    setReviewed(false);
    setResumePayments([]);
    setResumeReviewed(false);
    setOrigin(window.location.origin);
    const readMode = identity.mode === "guest" ? "guest" : "access";
    void readSharedPaymentCapabilities(capabilityController.signal)
      .then((value) => {
        if (active) setCapabilities(value);
      })
      .catch((problem) => {
        if (active && !isAborted(problem))
          setCapabilities({
            available: false,
            guestEligible: false,
            message:
              "Shared payment setup is unavailable. Existing payment progress can still be checked.",
          });
      });

    function schedule(snapshot: SharedPaymentRoom | null) {
      if (!active || document.visibilityState === "hidden" || !snapshot) return;
      if (!fundingOpen(snapshot) && !snapshot.shares.some((share) => share.status === "processing"))
        return;
      if (updates >= MAX_AUTOMATIC_UPDATES) {
        setAutomaticPaused(true);
        setFresh(false);
        return;
      }
      timer = setTimeout(
        () => {
          void read(false);
        },
        snapshot.shares.some((share) => share.status === "processing") ? 5000 : 15000,
      );
    }

    async function read(initial: boolean) {
      if (!active || document.visibilityState === "hidden" || !selectedId) return;
      if (mutating.current) {
        schedule(currentRoom.current);
        return;
      }
      readController.current?.abort();
      const controller = new AbortController();
      readController.current = controller;
      const requestId = ++version.current;
      updates += 1;
      try {
        const invitation = initial
          ? parseSharedPaymentInvitation(selectedId, window.location.hash)
          : null;
        const reconcile = currentRoom.current?.shares.some(
          (share) => share.status === "processing",
        );
        const result = invitation
          ? await requestSharedPayment(
              "guest",
              { action: "join", ...invitation },
              getMealDeckCustomerAccessToken,
              controller.signal,
            )
          : await requestSharedPayment(
              readMode,
              { action: reconcile ? "reconcile" : "room", roomId: selectedId },
              getMealDeckCustomerAccessToken,
              controller.signal,
            );
        if (!active || requestId !== version.current || controller.signal.aborted) return;
        acceptResult(result);
        if (invitation)
          window.history.replaceState(window.history.state, "", sharedPaymentRoomPath(selectedId));
        setLoading(false);
        if (invitation)
          timer = setTimeout(() => {
            void read(false);
          }, 0);
        else schedule(result.room);
      } catch (problem) {
        if (!active || requestId !== version.current || isAborted(problem)) return;
        setFresh(false);
        setLoading(false);
        setIssue(problemMessage(problem));
        schedule(currentRoom.current);
      }
    }

    try {
      selectedId = resolveSharedPaymentRoom(window.location.search);
      setRoomId(selectedId);
      if (selectedId !== currentRoom.current?.roomId) {
        currentRoom.current = null;
        setRoom(null);
        setInvites([]);
      }
      if (selectedId) {
        void read(true);
      } else {
        setLoading(false);
      }
    } catch (problem) {
      setLoading(false);
      setIssue(problemMessage(problem));
      setRoomId(null);
      setRoom(null);
    }

    const visibilityChanged = () => {
      clearTimeout(timer);
      if (document.visibilityState === "hidden") {
        readController.current?.abort();
        setFresh(false);
      } else {
        updates = 0;
        setAutomaticPaused(false);
        void read(true);
      }
    };
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      active = false;
      clearTimeout(timer);
      capabilityController.abort();
      readController.current?.abort();
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [routeRoomId, locationVersion, identity.mode, acceptResult, refreshVersion]);

  const ownShare = room?.shares.find((share) => share.shareId === room.viewer.shareId);
  const due = room
    ? room.viewer.role === "organiser"
      ? sharedPaymentUnclaimedPence(room)
      : ownShare
        ? Math.max(0, ownShare.amountPence - ownShare.paidPence)
        : 0
    : 0;
  const reviewKey = room
    ? [
        room.roomId,
        room.viewer.role,
        room.viewer.shareId,
        room.totalPence,
        room.remainingPence,
        due,
        room.status,
        payerKey,
      ].join(":")
    : "";
  useEffect(() => {
    if (previousReviewKey.current === reviewKey) return;
    const wasReviewed = previousReviewKey.current !== "";
    previousReviewKey.current = reviewKey;
    setReviewed(false);
    if (wasReviewed && dialog === "pay" && !busy) {
      setDialog(null);
      setNotice("Payment progress changed. Review the latest amount before continuing.");
    }
  }, [reviewKey, dialog, busy]);
  const canPay =
    !!room &&
    fresh &&
    !busy &&
    !loading &&
    identity.ready &&
    room.canPay &&
    fundingOpen(room) &&
    resultPayerKey === payerKey &&
    due > 0;
  const visibleResumes =
    room && fundingOpen(room) && identity.ready && resultPayerKey === payerKey
      ? resumePayments
      : [];
  const currentResume = visibleResumes.find(
    (attempt) =>
      selectedResume &&
      attempt.attemptId === selectedResume.attemptId &&
      attempt.amountPence === selectedResume.amountPence &&
      attempt.coverRemaining === selectedResume.coverRemaining,
  );
  const canResume = !!currentResume && fresh && !busy && !loading;

  useEffect(() => {
    if (dialog !== "resume" || busy || currentResume) return;
    setDialog(null);
    setResumeReviewed(false);
    setNotice("Saved payment progress changed. Check the latest payment details below.");
  }, [dialog, busy, currentResume]);

  function openDialog(next: "pay" | "resume" | "cancel", opener: HTMLElement) {
    dialogOpener.current = opener;
    setDialogIssue("");
    setResumeReviewed(false);
    setDialog(next);
  }
  function closeDialogFocus(event: Event) {
    event.preventDefault();
    if (!focusVisible(dialogOpener.current)) focusVisible(heading.current);
  }
  async function pay(resume?: SharedPaymentResume) {
    const snapshot = currentRoom.current;
    if (
      !snapshot ||
      mutating.current ||
      (resume ? !canResume || !resumeReviewed : !canPay || !reviewed)
    )
      return;
    const key = [
      snapshot.roomId,
      payerKey,
      snapshot.viewer.role,
      snapshot.viewer.shareId,
      due,
    ].join(":");
    if (!resume && paymentAttempt.current?.key !== key)
      paymentAttempt.current = { key, id: crypto.randomUUID() };
    const attemptId = resume?.attemptId ?? paymentAttempt.current?.id;
    if (!attemptId) return;
    const requestId = ++version.current;
    const controller = new AbortController();
    mutationController.current = controller;
    readController.current?.abort();
    mutating.current = true;
    setBusy(true);
    setDialogIssue("");
    setIssue("");
    setFresh(false);
    let redirecting = false;
    try {
      const result = await requestSharedPayment(
        identity.mode,
        {
          action: "pay",
          roomId: snapshot.roomId,
          attemptId,
          coverRemaining: resume?.coverRemaining ?? snapshot.viewer.role === "organiser",
          reviewConfirmed: true,
        },
        getMealDeckCustomerAccessToken,
        controller.signal,
      );
      if (!mounted.current || requestId !== version.current) return;
      acceptResult(result);
      if (result.checkoutUrl) {
        const url = safeSharedPaymentCheckoutUrl(result.checkoutUrl);
        if (!url)
          throw new Error(
            "The secure payment link could not be verified. Refresh the room before trying again.",
          );
        rememberSharedPaymentRoom(result.room.roomId);
        redirecting = true;
        window.location.assign(url);
      } else {
        setDialog(null);
        setNotice(result.room.message || "Your latest payment progress is shown below.");
        setRefreshVersion((value) => value + 1);
      }
    } catch (problem) {
      if (mounted.current && requestId === version.current && !isAborted(problem)) {
        setFresh(false);
        setDialogIssue(problemMessage(problem));
        setIssue(problemMessage(problem));
      }
    } finally {
      mutating.current = false;
      if (mounted.current && !redirecting) setBusy(false);
    }
  }
  async function cancel() {
    const snapshot = currentRoom.current;
    if (
      !snapshot ||
      !fresh ||
      !snapshot.canCancel ||
      snapshot.viewer.role !== "organiser" ||
      mutating.current
    )
      return;
    const requestId = ++version.current;
    const controller = new AbortController();
    mutationController.current = controller;
    readController.current?.abort();
    mutating.current = true;
    setBusy(true);
    setDialogIssue("");
    try {
      const result = await requestSharedPayment(
        identity.mode === "guest" ? "guest" : "access",
        { action: "cancel", roomId: snapshot.roomId, confirm: true },
        getMealDeckCustomerAccessToken,
        controller.signal,
      );
      if (!mounted.current || requestId !== version.current) return;
      acceptResult(result);
      setDialog(null);
      setReviewed(false);
      setNotice(
        result.room.status === "refund_review"
          ? "Cancellation recorded. Received payments need refund review; no automatic refund has been confirmed."
          : result.room.message,
      );
    } catch (problem) {
      if (mounted.current && requestId === version.current && !isAborted(problem)) {
        setFresh(false);
        setDialogIssue(problemMessage(problem));
        setIssue(problemMessage(problem));
      }
    } finally {
      mutating.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <div className="md-shared-shell md-marketing-shell">
      <SiteHeader />
      <main className="md-shared-main" id="main-content">
        <div className="md-shared-topline">
          <a href="/group-order">
            <ArrowLeft size={18} aria-hidden="true" /> Group planner
          </a>
          <MealDeckLogo className="md-shared-logo" decorative />
        </div>
        <header className="md-shared-heading">
          <span className="md-shared-kicker">One order, every craving</span>
          <h1 ref={heading} tabIndex={-1}>
            Your group payment room.
          </h1>
          <p>
            Payments stay linked to one order. The kitchen starts after all required shares are
            paid; kitchen acceptance is a separate step.
          </p>
        </header>
        <div className="md-shared-update-row">
          <p className="md-shared-muted" role="status">
            {loading
              ? "Checking the latest payment progress…"
              : automaticPaused
                ? "Automatic updates are paused. Refresh to check the latest progress."
                : fresh
                  ? "Showing the latest confirmed payment progress."
                  : "Refresh before making another payment."}
          </p>
          <button
            type="button"
            className="md-shared-button md-shared-button-light"
            disabled={busy || loading}
            onClick={() => setRefreshVersion((value) => value + 1)}
          >
            {loading ? (
              <Loader2 size={17} className="md-shared-spin" aria-hidden="true" />
            ) : (
              <RefreshCw size={17} aria-hidden="true" />
            )}{" "}
            Refresh
          </button>
        </div>
        {issue && (
          <p className="md-shared-error" role="alert">
            {issue}
          </p>
        )}
        {notice && (
          <p className="md-shared-feedback" role="status">
            {notice}
          </p>
        )}
        {!loading && !room && (
          <section className="md-shared-card">
            <h2>{roomId ? "Reopen your private payment room" : "Open your group payment link"}</h2>
            <p>
              {roomId
                ? "Use the full invitation from your organiser. If you created the group, sign in with the account or use the guest browser session that opened it."
                : "Your organiser will send a payment link after the order and final total have been reviewed. A food-choice invitation is separate from a payment link."}
            </p>
            {capabilities && !capabilities.available && (
              <p className="md-shared-notice">
                {capabilities.message || "Shared payment setup is currently unavailable."}
              </p>
            )}
            {roomId && (
              <a
                className="md-shared-button"
                href={"/account?returnTo=" + encodeURIComponent("/group-pay")}
                onClick={() => rememberSharedPaymentRoom(roomId)}
              >
                Sign in to reopen your room
              </a>
            )}
            <a className="md-shared-button md-shared-button-light" href="/group-order">
              Back to group planner
            </a>
          </section>
        )}
        {room && (
          <>
            {capabilities && !capabilities.available && !room.canPay && fundingOpen(room) && (
              <p className="md-shared-notice">
                {capabilities.message ||
                  "Shared payment setup is unavailable. Existing payment progress remains visible."}
              </p>
            )}
            <section className="md-shared-funding" aria-labelledby="shared-funding-title">
              <div className="md-shared-funding-heading">
                <h2 id="shared-funding-title">{roomLabels[room.status]}</h2>
                <span className={"md-shared-status md-shared-status-" + room.status}>
                  {room.status === "paid" ? (
                    <CheckCircle2 size={18} aria-hidden="true" />
                  ) : (
                    <Users size={18} aria-hidden="true" />
                  )}
                  {room.viewer.role === "organiser" ? "Organiser view" : "Your private share"}
                </span>
              </div>
              <dl className="md-shared-funding-totals">
                <div>
                  <dt>Order total</dt>
                  <dd>{formatLaunchMenuPrice(room.totalPence)}</dd>
                </div>
                <div>
                  <dt>Payment confirmed</dt>
                  <dd>{formatLaunchMenuPrice(room.paidPence)}</dd>
                </div>
                <div>
                  <dt>Remaining</dt>
                  <dd>{formatLaunchMenuPrice(room.remainingPence)}</dd>
                </div>
              </dl>
              <progress
                max={room.totalPence}
                value={Math.min(room.paidPence, room.totalPence)}
                aria-label={
                  formatLaunchMenuPrice(room.paidPence) +
                  " confirmed of " +
                  formatLaunchMenuPrice(room.totalPence)
                }
              />
              <p className="md-shared-muted">
                <Clock3 size={16} aria-hidden="true" /> Funding deadline: {deadline(room.expiresAt)}{" "}
                UK time. Payments still processing are checked before any further action.
              </p>
              {room.message && (
                <p className="md-shared-room-message" role="status">
                  {room.message}
                </p>
              )}
            </section>
            {room.status === "refund_review" && (
              <section className="md-shared-notice">
                <h2>Keep this payment room for updates.</h2>
                <p>
                  Received payments need a refund review. Cancellation does not automatically refund
                  a card, and an unconfirmed refund is not shown as completed.
                </p>
              </section>
            )}
            {!fundingOpen(room) && room.status !== "paid" && room.status !== "refund_review" && (
              <p className="md-shared-notice">
                This room is not accepting new payments. Existing payment records remain visible
                here.
              </p>
            )}
            {room.status === "paid" && (
              <section className="md-shared-paid">
                <CheckCircle2 size={28} aria-hidden="true" />
                <div>
                  <h2>The group’s payment is complete.</h2>
                  <p>
                    Payment is confirmed for the full order. The organiser handles{" "}
                    {room.fulfilment === "curbside" ? "kerbside pickup" : "collection"}.
                  </p>
                  {room.handoffCode && (
                    <p>
                      Collection code{" "}
                      <strong className="md-shared-handoff">{room.handoffCode}</strong>
                    </p>
                  )}
                  {room.viewer.role === "organiser" && (
                    <a href={"/checkout?order=" + room.orderId}>View order and kitchen progress</a>
                  )}
                </div>
              </section>
            )}
            <div className="md-shared-room-grid">
              <RoomShares room={room} invites={invites} origin={origin} />
              <aside className="md-shared-room-aside" aria-label="Payment and collection">
                {fundingOpen(room) && (
                  <>
                    <PaymentIdentity
                      identity={identity}
                      roomId={room.roomId}
                      disabled={busy}
                      onGuestSaved={() => setRefreshVersion((value) => value + 1)}
                    />
                    {visibleResumes.length > 0 && (
                      <section className="md-shared-card md-shared-pay-card">
                        <div className="md-shared-section-title">
                          <CreditCard size={23} aria-hidden="true" />
                          <h2>Resume your payment</h2>
                        </div>
                        <p>
                          You already started these payments. Returning here does not cancel them.
                          Review the saved amount and return to the same secure payment.
                        </p>
                        {visibleResumes.map((attempt) => (
                          <div className="md-shared-resume" key={attempt.attemptId}>
                            <p className="md-shared-payment-amount">
                              {formatLaunchMenuPrice(attempt.amountPence)}
                              <span>
                                {attempt.coverRemaining ? "your group cover payment" : "your share"}
                                {" · confirmation pending"}
                              </span>
                            </p>
                            <button
                              type="button"
                              className="md-shared-button"
                              disabled={!fresh || busy || loading}
                              onClick={(event) => {
                                setSelectedResume(attempt);
                                openDialog("resume", event.currentTarget);
                              }}
                            >
                              <ArrowLeft size={18} aria-hidden="true" />
                              Review &amp; resume {formatLaunchMenuPrice(attempt.amountPence)}
                            </button>
                          </div>
                        ))}
                        <p className="md-shared-muted">
                          Payment is confirmed only after the payment service reports it. If you
                          have already paid, refresh the room to check its progress.
                        </p>
                      </section>
                    )}
                    <section className="md-shared-card md-shared-pay-card">
                      <div className="md-shared-section-title">
                        <CreditCard size={23} aria-hidden="true" />
                        <h2>
                          {room.viewer.role === "organiser"
                            ? "Cover remaining unpaid shares"
                            : "Pay your share"}
                        </h2>
                      </div>
                      <p>
                        {room.viewer.role === "organiser"
                          ? "You can cover shares that nobody is currently paying. Payments already in progress are excluded from this amount and keep their original payer."
                          : "Review your bag, the split method and your exact share before paying."}
                      </p>
                      <p className="md-shared-payment-amount">
                        {formatLaunchMenuPrice(due)}
                        <span>
                          {room.viewer.role === "organiser"
                            ? "available for you to cover"
                            : "remaining for your share"}
                        </span>
                      </p>
                      {!room.canPay && (
                        <p className="md-shared-notice">
                          {room.message ||
                            "Another payment cannot be started right now. Refresh to check the latest progress."}
                        </p>
                      )}
                      {room.canPay && !identity.ready && (
                        <p className="md-shared-muted">
                          Choose and confirm your member or guest details above before paying.
                        </p>
                      )}
                      {!fresh && (
                        <p className="md-shared-notice">
                          Payment progress needs a refresh before you can continue.
                        </p>
                      )}
                      <label className="md-shared-review">
                        <input
                          type="checkbox"
                          checked={reviewed}
                          disabled={!canPay}
                          onChange={(event) => setReviewed(event.target.checked)}
                        />
                        <span>
                          I’ve checked the items, flavours, extras, numbered bag and amount I will
                          pay.
                        </span>
                      </label>
                      <button
                        type="button"
                        className="md-shared-button"
                        disabled={!canPay || !reviewed}
                        onClick={(event) => openDialog("pay", event.currentTarget)}
                      >
                        {busy ? (
                          <Loader2 size={18} className="md-shared-spin" aria-hidden="true" />
                        ) : (
                          <ShieldCheck size={18} aria-hidden="true" />
                        )}
                        {room.viewer.role === "organiser" ? "Cover " : "Pay "}
                        {formatLaunchMenuPrice(due)}
                      </button>
                      <p className="md-shared-muted">
                        Secure payment opens with Stripe. A payment is marked paid only after
                        confirmation from the payment service.
                      </p>
                    </section>
                  </>
                )}
                <section className="md-shared-card">
                  <div className="md-shared-section-title">
                    <Package size={23} aria-hidden="true" />
                    <h2>One kitchen handoff</h2>
                  </div>
                  <dl className="md-shared-order-facts">
                    <div>
                      <dt>Fulfilment</dt>
                      <dd>{room.fulfilment === "curbside" ? "Kerbside pickup" : "Collection"}</dd>
                    </div>
                    <div>
                      <dt>Cutlery</dt>
                      <dd>{room.cutleryRequested ? "Requested" : "Not requested"}</dd>
                    </div>
                    <div>
                      <dt>Payment split</dt>
                      <dd>{room.splitMode === "equal" ? "Equal split" : "Each bag’s food"}</dd>
                    </div>
                  </dl>
                  <p className="md-shared-muted">
                    The kitchen receives the numbered bags and exact food choices. A payment link
                    does not add, change or duplicate any food.
                  </p>
                </section>
              </aside>
            </div>
            {room.viewer.role === "organiser" && room.canCancel && (
              <section className="md-shared-cancel">
                <div>
                  <h2>Need to cancel the group?</h2>
                  <p>
                    Any received payments will need refund review. Cancellation is not an automatic
                    refund.
                  </p>
                </div>
                <button
                  type="button"
                  className="md-shared-button md-shared-button-light"
                  disabled={busy || !fresh}
                  onClick={(event) => openDialog("cancel", event.currentTarget)}
                >
                  Review cancellation
                </button>
              </section>
            )}
            <p className="md-shared-reference">Payment room reference: {room.roomId}</p>
          </>
        )}
        <Dialog
          open={dialog !== null}
          onOpenChange={(open) => {
            if (!open && !busy) setDialog(null);
          }}
        >
          <DialogContent
            className="md-shared-dialog"
            onCloseAutoFocus={closeDialogFocus}
            onEscapeKeyDown={(event) => {
              if (busy) event.preventDefault();
            }}
            onPointerDownOutside={(event) => {
              if (busy) event.preventDefault();
            }}
          >
            <DialogTitle>
              {dialog === "cancel"
                ? "Cancel this group order?"
                : dialog === "resume"
                  ? "Resume your original payment?"
                  : room?.viewer.role === "organiser"
                    ? "Cover the unpaid shares?"
                    : "Continue to secure payment?"}
            </DialogTitle>
            <DialogDescription className="md-shared-dialog-description">
              {dialog === "cancel"
                ? "This cancels the group order when the payment service allows it. Payments already received, or still being checked, may need refund review. This action does not automatically refund anyone."
                : dialog === "resume"
                  ? "Return to your saved secure payment for " +
                    formatLaunchMenuPrice(selectedResume?.amountPence ?? 0) +
                    ". This reopens the original payment; it does not create a second payment or confirm that you have paid."
                  : "You will review and pay " +
                    formatLaunchMenuPrice(due) +
                    " with the payment provider. The latest server-confirmed amount and any payment already in progress are checked again first."}
            </DialogDescription>
            {dialog === "resume" && (
              <label className="md-shared-review">
                <input
                  type="checkbox"
                  checked={resumeReviewed}
                  disabled={!canResume}
                  onChange={(event) => setResumeReviewed(event.target.checked)}
                />
                <span>
                  I’ve checked the food and the saved payment amount of{" "}
                  {formatLaunchMenuPrice(selectedResume?.amountPence ?? 0)}.
                </span>
              </label>
            )}
            {dialogIssue && (
              <p className="md-shared-error" role="alert">
                {dialogIssue}
              </p>
            )}
            <div className="md-shared-actions">
              <button
                type="button"
                className="md-shared-button"
                disabled={
                  busy ||
                  !fresh ||
                  (dialog === "pay" && (!canPay || !reviewed)) ||
                  (dialog === "resume" && (!canResume || !resumeReviewed))
                }
                onClick={() => {
                  if (dialog === "cancel") void cancel();
                  else if (dialog === "resume" && currentResume) void pay(currentResume);
                  else if (dialog === "pay") void pay();
                }}
              >
                {busy ? (
                  <Loader2 size={18} className="md-shared-spin" aria-hidden="true" />
                ) : (
                  <Check size={18} aria-hidden="true" />
                )}
                {dialog === "cancel"
                  ? "Confirm cancellation"
                  : dialog === "resume"
                    ? "Resume with Stripe"
                    : "Continue to Stripe"}
              </button>
              <button
                type="button"
                className="md-shared-button md-shared-button-light"
                disabled={busy}
                onClick={() => setDialog(null)}
              >
                Back to payment room
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
      <SiteFooter />
    </div>
  );
}
