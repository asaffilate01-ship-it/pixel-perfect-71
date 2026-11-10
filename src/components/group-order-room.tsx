import { useBlocker, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  Loader2,
  LockKeyhole,
  RefreshCw,
  Share2,
  ShoppingBag,
  Users,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PaymentIdentity } from "@/components/group-payments/payment-identity";
import { usePaymentIdentity } from "@/components/group-payments/use-payment-identity";
import { GroupRoomMenu, GroupRoomChoices } from "@/components/group-room-menu";
import { GroupRoomSetup, type RoomCreationDetails } from "@/components/group-room-setup";
import { GroupRoomBilling } from "@/components/group-room-billing";
import {
  receiveRoomChoices,
  roomPersonPicks,
  roomPersonStatus,
  type RoomChoicesDraft,
} from "@/components/group-order-room-state";
import {
  groupOrderWirePicks,
  type GroupOrderCapabilities,
  type GroupOrderInvite,
  type GroupOrderInvitationPreview,
  type GroupOrderRequest,
  type GroupOrderResult,
  type GroupOrderRoom,
} from "@/lib/mealdeck-group-rooms";
import {
  fetchGroupOrderCapabilities,
  clearRememberedGroupOrderRoom,
  parseGroupOrderInvite,
  previewGroupOrderInvite,
  rememberGroupOrderRoom,
  requestGroupOrder,
  resolveGroupOrderRoom,
} from "@/lib/mealdeck-group-rooms-browser";
import {
  formatLaunchMenuPrice,
  launchMenuBasketDisplayPrice,
} from "@/lib/launch-menu-display-prices";
import { safeMealDeckCheckoutRedirect } from "@/lib/mealdeck-checkout-url";

type RoomRequest = Exclude<GroupOrderRequest, { action: "preview" }>;
// React remounts and parallel invitation reads must share the first cookie-minting GET.
let actorInitialisation: Promise<GroupOrderCapabilities> | null = null;
function initialiseRoomActor() {
  const pending = actorInitialisation ?? fetchGroupOrderCapabilities();
  actorInitialisation = pending;
  return pending.finally(() => {
    if (actorInitialisation === pending) actorInitialisation = null;
  });
}

type RoomDialog =
  | { kind: "close" | "leave" | "cancel" | "discard" }
  | { kind: "remove"; participantId: string; name: string }
  | { kind: "finalize"; revision: number }
  | { kind: "pay"; amountPence: number; coverRemaining: boolean; attemptId?: string };

function problemMessage(problem: unknown) {
  return problem instanceof Error
    ? problem.message
    : "The room could not be updated. Please retry.";
}

function useRoomClock(serverNow?: string) {
  const [now, setNow] = useState(0);
  const offset = useRef(0);
  useEffect(() => {
    if (serverNow) offset.current = Date.parse(serverNow) - Date.now();
    const tick = () => {
      if (!document.hidden) setNow(Date.now() + offset.current);
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [serverNow]);
  return now;
}

function remainingTime(deadline: string, now: number, initialSeconds = 180) {
  if (!now) return `${Math.floor(initialSeconds / 60)}:00`;
  const seconds = Math.max(0, Math.ceil((Date.parse(deadline) - now) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function RoomInviteLink({ name, url }: { name: string; url: string }) {
  const [notice, setNotice] = useState("");
  const [manualCopy, setManualCopy] = useState(false);
  return (
    <div className="md-room-invite-actions">
      <button
        type="button"
        className="md-room-small-button"
        onClick={() => {
          void navigator.clipboard?.writeText(url).then(
            () => setNotice("Invitation copied."),
            () => {
              setManualCopy(true);
              setNotice("Select and copy the invitation below.");
            },
          );
          if (!navigator.clipboard) {
            setManualCopy(true);
            setNotice("Select and copy the invitation below.");
          }
        }}
      >
        <Copy size={16} aria-hidden="true" /> Copy {name}’s invite
      </button>
      <button
        type="button"
        className="md-room-icon-button"
        aria-label={"Share invitation with " + name}
        onClick={() => {
          if (!navigator.share) {
            setManualCopy(true);
            setNotice("Copy this invitation to share it privately.");
            return;
          }
          void navigator
            .share({
              title: "Join our MealDeck order",
              text: name + ", join our room and choose your food.",
              url,
            })
            .catch((error: unknown) => {
              if (!(error instanceof DOMException && error.name === "AbortError")) {
                setManualCopy(true);
                setNotice("Copy this invitation to share it privately.");
              }
            });
        }}
      >
        <Share2 size={16} aria-hidden="true" />
      </button>
      {manualCopy && (
        <label className="md-room-manual-link">
          Private invitation for {name}
          <input readOnly value={url} onFocus={(event) => event.target.select()} />
        </label>
      )}
      <span className="md-room-fine" role="status">
        {notice}
      </span>
    </div>
  );
}

function RoomRoster({
  room,
  invites,
  now,
  busy,
  onDialog,
}: {
  room: GroupOrderRoom;
  invites: NonNullable<GroupOrderResult["inviteLinks"]>;
  now: number;
  busy: boolean;
  onDialog: (dialog: RoomDialog) => void;
}) {
  const organiser = room.viewer.role === "organiser";
  const collecting = ["collecting", "ready"].includes(room.phase);
  const closed = room.invitationsClosed || room.pendingCount === 0;
  return (
    <aside className="md-room-card md-room-roster" aria-labelledby="room-people-heading">
      <div className="md-room-section-title">
        <Users size={23} aria-hidden="true" />
        <h2 id="room-people-heading">In this room</h2>
        <span className="md-room-person-count">{room.joinedCount}/10</span>
      </div>
      {collecting && (
        <div className="md-room-countdown">
          <Clock3 size={20} aria-hidden="true" />
          <div>
            <strong>{closed ? "Everyone’s place is settled" : "Time left to join"}</strong>
            <p>
              {closed
                ? "Joined people can finish choosing their food."
                : "Unaccepted invitations drop out when the timer ends."}
            </p>
          </div>
          {!closed && (
            <span aria-label={remainingTime(room.joinDeadline, now) + " remaining to join"}>
              {remainingTime(room.joinDeadline, now)}
            </span>
          )}
        </div>
      )}
      <ul className="md-room-people">
        {room.people.map((person) => {
          const own = person.participantId === room.viewer.participantId;
          const invited = person.state === "invited";
          const inactive = ["left", "expired", "removed"].includes(person.state);
          const invitation = invites.find((entry) => entry.participantId === person.participantId);
          return (
            <li key={person.participantId} className={inactive ? "is-inactive" : undefined}>
              <div className="md-room-person-row">
                <span className="md-room-avatar" aria-hidden="true">
                  {person.name.slice(0, 1).toLocaleUpperCase("en-GB")}
                </span>
                <div className="md-room-person-copy">
                  <strong>
                    {person.name}
                    {own ? " · You" : ""}
                  </strong>
                  <small>
                    {person.isOrganiser
                      ? "Organiser"
                      : person.bagNumber
                        ? "Bag " + person.bagNumber
                        : "Group member"}
                  </small>
                  {collecting && person.choicesExpiresAt && (own || organiser) && (
                    <small className="md-room-saved-choice-clock" role="status">
                      {now && now >= Date.parse(person.choicesExpiresAt)
                        ? "Saved food time elapsed · refresh to confirm"
                        : `Saved food expires in ${remainingTime(person.choicesExpiresAt, now, 300)}`}
                    </small>
                  )}
                </div>
                <span
                  className={
                    "md-room-status md-room-status-" + (person.paymentState ?? person.state)
                  }
                >
                  {roomPersonStatus(person, room.phase)}
                </span>
                {organiser && collecting && !person.isOrganiser && !inactive && (
                  <button
                    type="button"
                    className="md-room-icon-button"
                    disabled={busy}
                    aria-label={"Remove " + person.name + " from this order"}
                    onClick={() =>
                      onDialog({
                        kind: "remove",
                        participantId: person.participantId,
                        name: person.name,
                      })
                    }
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                )}
              </div>
              {organiser && collecting && invited && invitation && (
                <RoomInviteLink name={person.name} url={invitation.url} />
              )}
            </li>
          );
        })}
      </ul>
      {collecting && room.people.some((person) => person.choicesExpiresAt !== undefined) && (
        <p className="md-room-muted">
          Unpaid saved food choices last five minutes from their last save; the person stays joined and can choose again. The room has a separate 30-minute limit.
        </p>
      )}
      {collecting && (
        <p className="md-room-muted">
          {room.readyCount} of {room.joinedCount} joined people ready
          {room.pendingCount
            ? ` · ${room.pendingCount} invitation${room.pendingCount === 1 ? "" : "s"} waiting`
            : ""}
          .
        </p>
      )}
      {organiser && collecting && room.pendingCount > 0 && (
        <button
          type="button"
          className="md-room-button md-room-button-light"
          disabled={busy}
          onClick={() => onDialog({ kind: "close" })}
        >
          Close joining now
        </button>
      )}
      <dl className="md-room-details">
        <div>
          <dt>Payment</dt>
          <dd>
            {room.paymentMode === "organiser"
              ? "Organiser pays for everyone"
              : "Everyone pays for their own food"}
          </dd>
        </div>
        <div>
          <dt>Collection</dt>
          <dd>{room.fulfilment === "curbside" ? "Kerbside · Luton" : "Collection · Luton"}</dd>
        </div>
        {organiser && room.fulfilment === "curbside" && room.vehicle && (
          <div>
            <dt>Car</dt>
            <dd>
              {room.vehicle.colour} {room.vehicle.make} · {room.vehicle.registrationLast4}
            </dd>
          </div>
        )}
        <div>
          <dt>Cutlery</dt>
          <dd>{room.cutleryRequested ? "Requested" : "No cutlery requested"}</dd>
        </div>
      </dl>
      <p className="md-room-fine">The kitchen gets one order, grouped and labelled by name.</p>
    </aside>
  );
}

export function GroupOrderRoom({ routeRoomId }: { routeRoomId?: string }) {
  const navigate = useNavigate();
  const identity = usePaymentIdentity();
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const [capabilities, setCapabilities] = useState<GroupOrderCapabilities | null>(null);
  // New room admission is server-authoritative, not based on registration launch dates.
  const newRoomsOpen = capabilities?.available === true;
  const [entryReady, setEntryReady] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [invite, setInvite] = useState<GroupOrderInvite | null>(null);
  const [preview, setPreview] = useState<GroupOrderInvitationPreview | null>(null);
  const [joinName, setJoinName] = useState("");
  const [result, setResult] = useState<GroupOrderResult | null>(null);
  const [draft, setDraft] = useState<RoomChoicesDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState("");
  const [pollIssue, setPollIssue] = useState("");
  const [notice, setNotice] = useState("");
  const [legacyLink, setLegacyLink] = useState(false);
  const [justOrganising, setJustOrganising] = useState(false);
  const [dialog, setDialog] = useState<RoomDialog | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const scope = useRef<string | null>(null);
  const snapshot = useRef<GroupOrderResult | null>(null);
  const choices = useRef<RoomChoicesDraft | null>(null);
  const requestSequence = useRef(0);
  const requestController = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const actorReady = useRef(false);
  const mounted = useRef(true);
  const heading = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const mutationOpener = useRef<HTMLElement | null>(null);
  const createAttempt = useRef<{ fingerprint: string; attemptId: string } | null>(null);
  const finalizeAttempt = useRef<{ roomId: string; revision: number; attemptId: string } | null>(
    null,
  );
  const payAttempt = useRef<{
    roomId: string;
    amountPence: number;
    coverRemaining: boolean;
    attemptId: string;
  } | null>(null);
  const invitationChecked = useRef<string | null>(null);
  const invitationRecoveryChecked = useRef<string | null>(null);
  const room = result?.room;
  const payment = result?.payment;
  const own = room?.people.find((person) => person.participantId === room.viewer.participantId);
  const isOrganiser = room?.viewer.role === "organiser";
  const collecting = !!room && ["collecting", "ready"].includes(room.phase);
  const groupHasFood = !!room?.people.some(
    (person) => ["joined", "ready"].includes(person.state) && !!person.picks?.length,
  );
  const inactive = !!own && ["left", "removed", "expired"].includes(own.state);
  const now = useRoomClock(room?.serverNow ?? preview?.serverNow);
  const navigation = useBlocker({
    shouldBlockFn: () => !!choices.current?.dirty,
    enableBeforeUnload: () => !!choices.current?.dirty,
    withResolver: true,
  });

  const updateDraft = useCallback((next: RoomChoicesDraft | null) => {
    choices.current = next;
    setDraft(next);
  }, []);

  const receive = useCallback(
    (next: GroupOrderResult, saved = false) => {
      if (scope.current && scope.current !== next.room.roomId) return false;
      const previous = snapshot.current;
      if (previous?.room.roomId === next.room.roomId && previous.room.revision > next.room.revision)
        return false;
      snapshot.current = next;
      setResult(next);
      updateDraft(receiveRoomChoices(choices.current, next.room, saved));
      setPollIssue("");
      if (next.room.closedAt || next.room.phase === "cancelled") clearRememberedGroupOrderRoom();
      else rememberGroupOrderRoom(next.room.roomId);
      return true;
    },
    [updateDraft],
  );

  const refreshCapabilities = useCallback(async () => {
    try {
      const next = await initialiseRoomActor();
      actorReady.current = true;
      if (mounted.current) setCapabilities(next);
      return next;
    } catch (problem) {
      if (mounted.current && !snapshot.current) setIssue(problemMessage(problem));
      return null;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refreshCapabilities();
    return () => {
      mounted.current = false;
      requestSequence.current += 1;
      requestController.current?.abort();
    };
  }, [refreshCapabilities]);

  useEffect(() => {
    if (newRoomsOpen) void refreshCapabilities();
  }, [newRoomsOpen, refreshCapabilities]);

  const availabilityAccountId =
    identity.account?.status === "signed_in" ? identity.account.profile.userId : null;
  useEffect(() => {
    if (!identity.loading) void refreshCapabilities();
  }, [availabilityAccountId, identity.loading, refreshCapabilities]);

  useEffect(() => {
    // A confirmed create/join/recovery has already installed this room. Navigation
    // may commit before the old invitation fragment disappears from location.
    if (
      routeRoomId &&
      scope.current === routeRoomId &&
      snapshot.current?.room.roomId === routeRoomId
    )
      return;
    const sequence = ++requestSequence.current;
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    snapshot.current = null;
    updateDraft(null);
    setResult(null);
    setPreview(null);
    setIssue("");
    setNotice("");
    setPollIssue("");
    setDialog(null);
    setInvite(null);
    setLoading(false);
    setLegacyLink(false);
    setEntryReady(true);
    try {
      if (window.location.hash.startsWith("#g=")) {
        scope.current = null;
        setRoomId(null);
        setLegacyLink(true);
        return;
      }
      const resolved = resolveGroupOrderRoom(window.location.search);
      const invitation = resolved ? parseGroupOrderInvite(resolved, window.location.hash) : null;
      scope.current = invitation ? null : resolved;
      setRoomId(invitation ? null : resolved);
      if (invitation) {
        setInvite(invitation);
        setLoading(true);
        void previewGroupOrderInvite(invitation, controller.signal)
          .then((next) => {
            if (!mounted.current || sequence !== requestSequence.current) return;
            setPreview(next);
            setJoinName(next.inviteeName);
          })
          .catch((problem: unknown) => {
            if (!controller.signal.aborted && sequence === requestSequence.current)
              setIssue(problemMessage(problem));
          })
          .finally(() => {
            if (sequence === requestSequence.current) setLoading(false);
          });
      }
    } catch (problem) {
      setIssue(problemMessage(problem));
      setRoomId(null);
      scope.current = null;
    }
  }, [routeRoomId, updateDraft]);

  const refreshRoom = useCallback(
    async (quiet = true) => {
      const currentRoomId = scope.current;
      if (!currentRoomId || busyRef.current || document.hidden) return;
      const sequence = ++requestSequence.current;
      requestController.current?.abort();
      const controller = new AbortController();
      requestController.current = controller;
      if (!quiet) setLoading(true);
      try {
        if (!actorReady.current && !(await refreshCapabilities())) return;
        if (
          !mounted.current ||
          controller.signal.aborted ||
          sequence !== requestSequence.current ||
          scope.current !== currentRoomId
        )
          return;
        const currentIdentity = identityRef.current;
        const next = await requestGroupOrder(
          { action: "room", roomId: currentRoomId },
          currentIdentity.ready ? currentIdentity.mode : undefined,
          controller.signal,
        );
        if (
          !mounted.current ||
          sequence !== requestSequence.current ||
          scope.current !== currentRoomId
        )
          return;
        receive(next);
        if (!quiet) setIssue("");
      } catch (problem) {
        if (controller.signal.aborted || sequence !== requestSequence.current) return;
        if (snapshot.current) setPollIssue(problemMessage(problem));
        else setIssue(problemMessage(problem));
      } finally {
        if (sequence === requestSequence.current) setLoading(false);
      }
    },
    [receive, refreshCapabilities],
  );

  const openExistingRoom = useCallback(
    async (existingRoomId: string, automatic = false) => {
      if (busyRef.current) return;
      const sequence = ++requestSequence.current;
      requestController.current?.abort();
      const controller = new AbortController();
      requestController.current = controller;
      setLoading(true);
      try {
        if (!actorReady.current && !(await refreshCapabilities())) return;
        if (!mounted.current || controller.signal.aborted || sequence !== requestSequence.current)
          return;
        // Membership recovery is read-only. A closed invitation never joins a new person.
        const next = await requestGroupOrder(
          { action: "room", roomId: existingRoomId },
          undefined,
          controller.signal,
        );
        if (!mounted.current || controller.signal.aborted || sequence !== requestSequence.current)
          return;
        if (requestController.current === controller) requestController.current = null;
        scope.current = next.room.roomId;
        receive(next);
        setRoomId(next.room.roomId);
        setInvite(null);
        setPreview(null);
        setIssue("");
        void navigate({
          to: "/group-order",
          search: { room: next.room.roomId },
          hash: "",
          replace: true,
        });
      } catch (problem) {
        if (!automatic && !controller.signal.aborted && sequence === requestSequence.current)
          setIssue(problemMessage(problem));
      } finally {
        if (sequence === requestSequence.current) setLoading(false);
      }
    },
    [navigate, receive, refreshCapabilities],
  );

  useEffect(() => {
    if (!invite || !preview || preview.joinable || !capabilities || busyRef.current) return;
    const key = invite.roomId + ":" + invite.participantId;
    if (invitationRecoveryChecked.current === key) return;
    invitationRecoveryChecked.current = key;
    void openExistingRoom(invite.roomId, true);
  }, [invite, preview, capabilities, openExistingRoom]);

  useEffect(() => {
    if (!roomId) return;
    void refreshRoom(false);
    const timer = window.setInterval(() => {
      void refreshRoom();
    }, 5000);
    const visible = () => {
      if (!document.hidden) void refreshRoom();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [roomId, refreshRoom]);

  useEffect(() => {
    if (roomId && identity.ready) void refreshRoom();
  }, [identity.ready, identity.mode, roomId, refreshRoom]);

  useEffect(() => {
    setReviewed(false);
  }, [dialog, payment?.paidPence, payment?.totalPence, identity.mode]);

  useEffect(() => {
    if (
      !invite ||
      !preview?.joinable ||
      !now ||
      now < Date.parse(preview.joinDeadline) ||
      busy ||
      busyRef.current ||
      document.hidden
    )
      return;
    const key = invite.participantId + preview.joinDeadline;
    if (invitationChecked.current === key) return;
    invitationChecked.current = key;
    const sequence = ++requestSequence.current;
    const controller = new AbortController();
    requestController.current?.abort();
    requestController.current = controller;
    void previewGroupOrderInvite(invite, controller.signal)
      .then((next) => {
        if (mounted.current && sequence === requestSequence.current) setPreview(next);
      })
      .catch((problem: unknown) => {
        if (!controller.signal.aborted && sequence === requestSequence.current)
          setIssue(problemMessage(problem));
      });
  }, [invite, preview, now, busy]);

  async function run(input: RoomRequest, saveChoices = false): Promise<GroupOrderResult | null> {
    if (busyRef.current) return null;
    const sequence = ++requestSequence.current;
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    busyRef.current = true;
    setBusy(true);
    setIssue("");
    setNotice("");
    try {
      if (!actorReady.current && !(await refreshCapabilities())) return null;
      if (!mounted.current || controller.signal.aborted || sequence !== requestSequence.current)
        return null;
      const requiresIdentity = ["create", "finalize", "pay", "cancel"].includes(input.action);
      const next = await requestGroupOrder(
        input,
        requiresIdentity || identityRef.current.ready ? identityRef.current.mode : undefined,
        controller.signal,
      );
      if (!mounted.current || sequence !== requestSequence.current) return null;
      // The mutation is fully received before room/navigation effects may start a read.
      if (requestController.current === controller) requestController.current = null;
      if (input.action === "create" || input.action === "join") {
        scope.current = next.room.roomId;
      }
      receive(next, saveChoices);
      if (input.action === "create" || input.action === "join") {
        setRoomId(next.room.roomId);
        setInvite(null);
        setPreview(null);
      }
      if (input.action === "create" || input.action === "join") {
        void navigate({
          to: "/group-order",
          search: { room: next.room.roomId },
          hash: "",
          replace: true,
        });
        heading.current?.focus({ preventScroll: true });
      }
      return next;
    } catch (problem) {
      if (!controller.signal.aborted && sequence === requestSequence.current) {
        setIssue(problemMessage(problem));
        window.setTimeout(() => errorRef.current?.focus({ preventScroll: true }), 0);
      }
      return null;
    } finally {
      busyRef.current = false;
      if (mounted.current) {
        setBusy(false);
        setLoading(false);
      }
    }
  }

  function openDialog(next: RoomDialog) {
    mutationOpener.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDialog(next);
  }

  async function createRoom(details: RoomCreationDetails) {
    if (!newRoomsOpen) return;
    const fingerprint = JSON.stringify(details);
    if (createAttempt.current?.fingerprint !== fingerprint)
      createAttempt.current = { fingerprint, attemptId: crypto.randomUUID() };
    await run({ action: "create", ...details, attemptId: createAttempt.current.attemptId });
  }

  async function saveChoices(ready: boolean) {
    const current = snapshot.current?.room;
    const local = choices.current;
    if (!current || !local || local.conflict || busyRef.current || current.phase === "payment")
      return;
    let version = local.version;
    if (local.dirty) {
      const saved = await run(
        {
          action: "save",
          roomId: current.roomId,
          version,
          picks: groupOrderWirePicks(local.picks),
        },
        true,
      );
      if (!saved) return;
      version = saved.room.people.find(
        (person) => person.participantId === saved.room.viewer.participantId,
      )!.version;
    }
    if (ready) {
      const saved = await run(
        { action: "ready", roomId: current.roomId, version, ready: true },
        true,
      );
      if (saved) {
        setNotice("You’re ready. The organiser can lock the order when everyone is ready.");
        heading.current?.focus({ preventScroll: true });
      }
    } else setNotice("Your choices are saved in the room.");
  }

  async function confirmDialog() {
    const current = snapshot.current?.room;
    if (!dialog || !current || busyRef.current) return;
    if (dialog.kind === "discard") {
      updateDraft(receiveRoomChoices(null, current));
      setDialog(null);
      return;
    }
    let next: GroupOrderResult | null = null;
    if (dialog.kind === "remove")
      next = await run({
        action: "remove",
        roomId: current.roomId,
        participantId: dialog.participantId,
      });
    if (dialog.kind === "close") next = await run({ action: "close", roomId: current.roomId });
    if (dialog.kind === "leave")
      next = await run({ action: "leave", roomId: current.roomId }, true);
    if (dialog.kind === "cancel")
      next = await run({ action: "cancel", roomId: current.roomId, confirm: true }, true);
    if (dialog.kind === "finalize") {
      if (!reviewed || !current.canFinalize || current.revision !== dialog.revision) return;
      if (
        finalizeAttempt.current?.roomId !== current.roomId ||
        finalizeAttempt.current.revision !== current.revision
      )
        finalizeAttempt.current = {
          roomId: current.roomId,
          revision: current.revision,
          attemptId: crypto.randomUUID(),
        };
      next = await run(
        {
          action: "finalize",
          roomId: current.roomId,
          revision: dialog.revision,
          attemptId: finalizeAttempt.current.attemptId,
          reviewConfirmed: true,
        },
        true,
      );
    }
    if (dialog.kind === "pay") {
      if (!reviewed || !identityRef.current.ready || !dialogPaymentAllowed) return;
      if (
        !dialog.attemptId &&
        (payAttempt.current?.roomId !== current.roomId ||
          payAttempt.current.amountPence !== dialog.amountPence ||
          payAttempt.current.coverRemaining !== dialog.coverRemaining)
      )
        payAttempt.current = {
          roomId: current.roomId,
          amountPence: dialog.amountPence,
          coverRemaining: dialog.coverRemaining,
          attemptId: crypto.randomUUID(),
        };
      next = await run({
        action: "pay",
        roomId: current.roomId,
        attemptId: dialog.attemptId ?? payAttempt.current!.attemptId,
        coverRemaining: dialog.coverRemaining,
        reviewConfirmed: true,
      });
      if (next?.checkoutUrl) {
        const checkout = safeMealDeckCheckoutRedirect(next.checkoutUrl);
        if (checkout) {
          window.location.assign(checkout);
          return;
        }
      }
    }
    if (next) setDialog(null);
  }

  const ownShare = payment?.shares.find((share) => share.shareId === own?.shareId);
  const organiserPays = room?.paymentMode === "organiser";
  const paymentOpen = !!payment && ["awaiting_payment", "partially_paid"].includes(payment.status);
  const payAmount = organiserPays
    ? (payment?.remainingPence ?? 0)
    : Math.max(0, (ownShare?.amountPence ?? 0) - (ownShare?.paidPence ?? 0));
  const canOwnPay =
    paymentOpen &&
    !!payment?.canPay &&
    !!identity.ready &&
    !busy &&
    payAmount > 0 &&
    (organiserPays ? !!isOrganiser : ownShare?.status === "unpaid");
  const resumes = paymentOpen ? (result?.resumePayments ?? []) : [];
  const dialogPaymentAllowed =
    dialog?.kind !== "pay" ||
    (identity.ready &&
      paymentOpen &&
      (dialog.attemptId
        ? resumes.some(
            (resume) =>
              resume.attemptId === dialog.attemptId &&
              resume.amountPence === dialog.amountPence &&
              resume.coverRemaining === dialog.coverRemaining,
          )
        : (canOwnPay && payAmount === dialog.amountPence) ||
          resumes.some(
            (resume) =>
              resume.attemptId === payAttempt.current?.attemptId &&
              resume.amountPence === dialog.amountPence &&
              resume.coverRemaining === dialog.coverRemaining,
          )));
  const needsIdentity =
    !!room &&
    !inactive &&
    room.phase !== "cancelled" &&
    ((collecting && isOrganiser && room.canFinalize) ||
      (paymentOpen && (organiserPays ? isOrganiser : !!ownShare && ownShare.status !== "paid")));
  const readyDisabled =
    busy ||
    !!draft?.conflict ||
    !draft ||
    (draft.picks.length === 0 && !(isOrganiser && justOrganising));
  const dialogTitle =
    dialog?.kind === "remove"
      ? `Remove ${dialog.name}?`
      : dialog?.kind === "close"
        ? "Close joining now?"
        : dialog?.kind === "leave"
          ? "Leave this group order?"
          : dialog?.kind === "cancel"
            ? "Cancel this group order?"
            : dialog?.kind === "discard"
              ? "Use your saved room choices?"
              : dialog?.kind === "finalize"
                ? "Lock this order for payment?"
                : dialog?.kind === "pay"
                  ? `Review your ${formatLaunchMenuPrice(dialog.amountPence)} payment`
                  : "";

  function startNewRoom() {
    if (choices.current?.dirty || busyRef.current) return;
    requestSequence.current += 1;
    requestController.current?.abort();
    clearRememberedGroupOrderRoom();
    scope.current = null;
    snapshot.current = null;
    updateDraft(null);
    setResult(null);
    setRoomId(null);
    setInvite(null);
    setPreview(null);
    setIssue("");
    setNotice("");
    setDialog(null);
    setLegacyLink(false);
    setPollIssue("");
    void navigate({ to: "/group-order", search: {}, hash: "" });
    heading.current?.focus({ preventScroll: true });
  }

  return (
    <div className="md-marketing-shell md-room-shell md-shared-shell">
      <SiteHeader
        nav={false}
        context={
          <a href="/menus" className="md-room-header-link">
            <ArrowLeft size={17} aria-hidden="true" /> Menus
          </a>
        }
      />
      <main className="md-room-main md-shared-main">
        <header className="md-room-header">
          <div>
            <span className="md-room-kicker">MealDeck · Group order</span>
            <h1 ref={heading} tabIndex={-1}>
              {room
                ? "Your room. One order."
                : invite
                  ? "You’re invited to the table."
                  : newRoomsOpen
                    ? "Get the group together."
                    : capabilities
                      ? "Group rooms not accepting new orders"
                      : "Checking group ordering availability"}
            </h1>
            <p>
              {room
                ? "Choose your food, get ready, pay your way."
                : !invite && !newRoomsOpen
                  ? capabilities?.message || "Checking whether group rooms are available…"
                  : "Everyone chooses their favourites. We bring the whole order together."}
            </p>
          </div>
          {room && (
            <button
              type="button"
              className="md-room-button md-room-button-light"
              disabled={busy || loading}
              onClick={() => {
                void refreshRoom(false);
              }}
            >
              <RefreshCw
                size={17}
                className={loading ? "md-room-spin" : undefined}
                aria-hidden="true"
              />{" "}
              Refresh room
            </button>
          )}
        </header>
        {room?.unpaidRoomExpiresAt && collecting && (
          <div className="md-room-notice" role="status">
            <Clock3 size={18} aria-hidden="true" />
            <strong>Place the group order within 30 minutes of creating the room.</strong>
            {" "}Time left: {remainingTime(room.unpaidRoomExpiresAt, now)}. Accepted invitations
            stay joined, but this unplaced room closes when the timer ends. A locked
            payment order is protected from this timeout.
          </div>
        )}
        {room?.closedAt && (
          <div className="md-room-notice" role="status">
            <strong>{room.closeReason === "fulfilled" ? "Order handed over — group room closed." :
              room.closeReason === "unpaid_timeout" ? "This unplaced room expired after 30 minutes." :
              "This group room is closed."}</strong>
            {" "}The saved room no longer accepts choices or payments. Paid receipts remain available.
          </div>
        )}
        {room && (
          <ol className="md-room-steps" aria-label="Group order progress">
            {["Join", "Choose", "Pay", "Kitchen"].map((label, index) => {
              const step =
                payment?.status === "paid"
                  ? 3
                  : room.phase === "payment"
                    ? 2
                    : room.pendingCount === 0
                      ? 1
                      : 0;
              return (
                <li
                  key={label}
                  className={index <= step ? "is-active" : undefined}
                  aria-current={index === step ? "step" : undefined}
                >
                  <span>{index < step ? <Check size={15} aria-hidden="true" /> : index + 1}</span>
                  {label}
                </li>
              );
            })}
          </ol>
        )}
        {issue && !dialog && (
          <div ref={errorRef} className="md-room-error" role="alert" tabIndex={-1}>
            <strong>We couldn’t finish that step.</strong>
            <p>{issue}</p>
            <button
              type="button"
              className="md-room-small-button"
              disabled={busy || loading}
              onClick={() => {
                if (!capabilities) void refreshCapabilities();
                if (invite) {
                  setLoading(true);
                  const sequence = ++requestSequence.current;
                  void previewGroupOrderInvite(invite)
                    .then((next) => {
                      if (sequence === requestSequence.current) {
                        setPreview(next);
                        setJoinName(next.inviteeName);
                        setIssue("");
                      }
                    })
                    .catch((error: unknown) => {
                      if (sequence === requestSequence.current) setIssue(problemMessage(error));
                    })
                    .finally(() => {
                      if (sequence === requestSequence.current) setLoading(false);
                    });
                } else if (roomId) void refreshRoom(false);
                else refreshCapabilities();
              }}
            >
              Check again
            </button>
            {roomId && !room && !invite && !loading && (
              <button type="button" className="md-room-text-button" onClick={startNewRoom}>
                {newRoomsOpen ? "Start a new room" : "Check group room availability"}
              </button>
            )}
          </div>
        )}
        {pollIssue && (
          <div className="md-room-notice" role="status">
            <strong>Room updates are paused.</strong>
            <p>{pollIssue} Your unsaved choices are still here.</p>
            <button
              type="button"
              className="md-room-small-button"
              disabled={busy}
              onClick={() => {
                void refreshRoom(false);
              }}
            >
              Reconnect
            </button>
          </div>
        )}
        {notice && (
          <p className="md-room-notice" role="status">
            {notice}
          </p>
        )}
        {legacyLink && (
          <div className="md-room-notice">
            <h2>This is an older group-planning link.</h2>
            <p>
              {newRoomsOpen
                ? "MealDeck now uses live rooms. Create a room below and invite everyone to join it."
                : "New group rooms are not accepting orders at the moment."}{" "}
              Older reply links cannot add food to this order.
            </p>
          </div>
        )}
        {(!entryReady || (loading && !room && !preview)) && (
          <div className="md-room-card md-room-loading" role="status">
            <Loader2 size={24} className="md-room-spin" aria-hidden="true" /> Opening your group
            room…
          </div>
        )}
        {entryReady && !roomId && !invite && !newRoomsOpen && (
          <section className="md-room-card md-room-join" aria-labelledby="group-start-heading">
            <span className="md-room-kicker">Group room availability</span>
            <h2 id="group-start-heading">New group rooms are not accepting orders right now.</h2>
            <p>
              {capabilities?.message || "Checking group room availability. Existing rooms and private invitation links remain accessible."}
            </p>
            <button
              type="button"
              className="md-room-button md-room-button-light"
              disabled={busy}
              onClick={() => { void refreshCapabilities(); }}
            >
              <RefreshCw size={18} aria-hidden="true" /> Check availability again
            </button>
            <a href="/menus" className="md-room-button">
              Explore the menus <ArrowRight size={19} aria-hidden="true" />
            </a>
            <p className="md-room-fine">
              Already have a room? Your existing room or invitation link still works.
            </p>
          </section>
        )}
        {entryReady && !roomId && !invite && newRoomsOpen && (
          <GroupRoomSetup
            identity={identity}
            capabilities={capabilities}
            busy={busy}
            onCreate={(details) => {
              void createRoom(details);
            }}
            onRefresh={refreshCapabilities}
          />
        )}
        {invite && preview && (
          <section className="md-room-card md-room-join" aria-labelledby="room-join-heading">
            <span className="md-room-kicker">An invitation from {preview.organiserName}</span>
            <h2 id="room-join-heading">Join {preview.organiserName}’s order.</h2>
            <p>
              {preview.paymentMode === "organiser"
                ? `${preview.organiserName} is paying for everyone. You choose your food.`
                : "Choose your food, then pay for your own items once the group is ready."}
            </p>
            <div className="md-room-countdown">
              <Clock3 size={22} aria-hidden="true" />
              <div>
                <strong>
                  {preview.joinable ? "Accept your place in the room" : "This invitation is closed"}
                </strong>
                <p>
                  {preview.message || "Join now. You can choose your food after you’ve joined."}
                </p>
              </div>
              {preview.joinable && <span>{remainingTime(preview.joinDeadline, now)}</span>}
            </div>
            {preview.joinable && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!actorReady.current || loading) return;
                  void run({ action: "join", ...invite, name: joinName.trim() }, true);
                }}
              >
                <label>
                  Your name on the bag
                  <input
                    required
                    maxLength={32}
                    value={joinName}
                    onChange={(event) => setJoinName(event.target.value)}
                    autoComplete="given-name"
                    disabled={busy}
                  />
                </label>
                <p className="md-room-fine">
                  Your name and progress are visible to the group. The organiser can review your
                  choices, and the kitchen uses your name to pack your food.
                </p>
                <button
                  type="submit"
                  className="md-room-button"
                  disabled={busy || loading || !capabilities || !joinName.trim()}
                >
                  {busy
                    ? "Joining…"
                    : !capabilities
                      ? "Preparing secure room access…"
                      : "Accept & join room"}
                  <ArrowRight size={18} aria-hidden="true" />
                </button>
              </form>
            )}
            <button
              type="button"
              className="md-room-text-button"
              disabled={busy || loading || !capabilities}
              onClick={() => {
                void openExistingRoom(invite.roomId);
              }}
            >
              Already joined on this browser? Open the room
            </button>
          </section>
        )}
        {(room?.phase === "payment" || room?.phase === "cancelled" || inactive) && draft?.dirty && (
          <div className="md-room-notice">
            <strong>
              {room?.phase === "payment"
                ? "This order was locked from another tab or device."
                : "Your place in this order has closed."}
            </strong>
            <p>
              Your unsaved changes are still in this tab. They were not added to the saved order.
            </p>
            <details>
              <summary>Review my unsaved choices</summary>
              <GroupRoomChoices picks={draft.picks} />
            </details>
            <button
              type="button"
              className="md-room-button md-room-button-light"
              onClick={() => openDialog({ kind: "discard" })}
            >
              Discard unsaved changes
            </button>
          </div>
        )}
        {room && (
          <div className="md-room-layout">
            <div className="md-room-workspace">
              {room.phase === "cancelled" || inactive || !!room.closedAt ? (
                <>
                  <section className="md-room-card">
                    <h2>
                      {inactive
                        ? "You’re no longer in this order."
                        : room.closeReason === "fulfilled"
                          ? "Your order is complete — room closed."
                          : "This group order is closed."}
                    </h2>
                    <p>
                      {inactive
                        ? "Your place is closed. The organiser’s room keeps its current participants."
                        : "The room is closed to new choices and payments. Any paid order remains in order history."}
                    </p>
                    <a href="/menus" className="md-room-button md-room-button-light">
                      Browse menus
                    </a>
                  </section>
                  {payment && <GroupRoomBilling room={room} payment={payment} />}
                </>
              ) : (
                <>
                  {collecting && own && draft && (
                    <section className="md-room-card" aria-labelledby="room-my-order-heading">
                      <div className="md-room-section-title">
                        <ShoppingBag size={24} aria-hidden="true" />
                        <h2 id="room-my-order-heading">{own.name}’s order</h2>
                        <span className={"md-room-status md-room-status-" + own.state}>
                          {roomPersonStatus(own, room.phase)}
                        </span>
                      </div>
                      {draft.conflict && (
                        <div className="md-room-notice">
                          <strong>Your saved choices changed in another tab or device.</strong>
                          <p>
                            Your unsaved choices have been kept in this tab. Compare them with the
                            saved choices before replacing your local changes.
                          </p>
                          <details>
                            <summary>Review my unsaved choices</summary>
                            <GroupRoomChoices picks={draft.picks} />
                          </details>
                          <details>
                            <summary>View choices currently saved in the room</summary>
                            <GroupRoomChoices picks={roomPersonPicks(own)} />
                          </details>
                          <button
                            type="button"
                            className="md-room-button md-room-button-light"
                            disabled={busy}
                            onClick={() => openDialog({ kind: "discard" })}
                          >
                            Use saved room choices
                          </button>
                        </div>
                      )}
                      {own.state === "ready" ? (
                        <>
                          <p className="md-room-ready-copy">
                            <CheckCircle2 size={20} aria-hidden="true" /> You’re ready. Your choices
                            stay fixed until you choose to change them.
                          </p>
                          {own.picks?.length ? (
                            <GroupRoomChoices picks={roomPersonPicks(own)} />
                          ) : (
                            <p>You’re organising this order without a bag of your own.</p>
                          )}
                          <button
                            type="button"
                            className="md-room-button md-room-button-light"
                            disabled={busy || !!draft.conflict}
                            onClick={() => {
                              void run(
                                {
                                  action: "ready",
                                  roomId: room.roomId,
                                  version: own.version,
                                  ready: false,
                                },
                                true,
                              ).then((next) => {
                                if (next)
                                  setNotice(
                                    "You can change your choices. Mark yourself ready again when you’ve finished.",
                                  );
                              });
                            }}
                          >
                            Change choices
                          </button>
                        </>
                      ) : (
                        <>
                          <GroupRoomMenu
                            picks={draft.picks}
                            disabled={busy || draft.conflict}
                            onChange={(picks) => updateDraft({ ...draft, picks, dirty: true })}
                          />
                          {isOrganiser && draft.picks.length === 0 && (
                            <label className="md-room-checkbox">
                              <input
                                type="checkbox"
                                checked={justOrganising}
                                disabled={busy || draft.conflict}
                                onChange={(event) => setJustOrganising(event.target.checked)}
                              />
                              <span>I’m just organising — no food for me</span>
                            </label>
                          )}
                          <div className="md-room-save-bar">
                            <p role="status">
                              {busy
                                ? "Saving your change…"
                                : draft.dirty
                                  ? "You have unsaved choices."
                                  : "Your choices are saved."}
                            </p>
                            <div className="md-room-actions">
                              <button
                                type="button"
                                className="md-room-button md-room-button-light"
                                disabled={busy || !draft.dirty || draft.conflict}
                                onClick={() => {
                                  void saveChoices(false);
                                }}
                              >
                                Save choices
                              </button>
                              <button
                                type="button"
                                className="md-room-button"
                                disabled={readyDisabled}
                                onClick={() => {
                                  void saveChoices(true);
                                }}
                              >
                                {draft.dirty ? "Save & I’m ready" : "I’m ready"}
                                <Check size={18} aria-hidden="true" />
                              </button>
                            </div>
                          </div>
                          {!isOrganiser && draft.picks.length === 0 && (
                            <p className="md-room-fine">
                              Choose at least one item, or leave the room if you’re not ordering.
                            </p>
                          )}
                        </>
                      )}
                    </section>
                  )}
                  {collecting && isOrganiser && (
                    <section className="md-room-card" aria-labelledby="room-review-heading">
                      <span className="md-room-kicker">Organiser’s review</span>
                      <h2 id="room-review-heading">Everyone’s food, by name.</h2>
                      <p className="md-room-muted">
                        Check the group’s choices before locking one order for payment. Each person
                        gets the food beside their name.
                      </p>
                      <div className="md-room-review-people">
                        {room.people
                          .filter((person) => ["joined", "ready"].includes(person.state))
                          .map((person) => (
                            <details key={person.participantId}>
                              <summary>
                                <span>
                                  <strong>{person.name}</strong>
                                  <small>
                                    {person.picks?.length
                                      ? formatLaunchMenuPrice(
                                          launchMenuBasketDisplayPrice(roomPersonPicks(person))
                                            .itemsSubtotalPence,
                                        ) + " menu subtotal"
                                      : person.isOrganiser && person.state === "ready"
                                        ? "Organising only"
                                        : "No choices yet"}
                                  </small>
                                </span>
                                <span className={"md-room-status md-room-status-" + person.state}>
                                  {roomPersonStatus(person, room.phase)}
                                </span>
                              </summary>
                              {person.picks?.length ? (
                                <GroupRoomChoices picks={roomPersonPicks(person)} />
                              ) : (
                                <p className="md-room-muted">
                                  {person.isOrganiser && person.state === "ready"
                                    ? "Organising without a food bag."
                                    : "This person has not added food yet."}
                                </p>
                              )}
                            </details>
                          ))}
                      </div>
                      {(!room.canFinalize || !groupHasFood) && (
                        <p className="md-room-notice">
                          {room.pendingCount > 0
                            ? "Waiting for invitations to be accepted or expire. You can close joining now if everyone is here."
                            : !groupHasFood
                              ? "This group needs some food before it can become an order. Change your choices to add food."
                              : "Everyone who has joined needs to finish choosing and tap “I’m ready”."}
                        </p>
                      )}
                      {room.canFinalize && groupHasFood && (
                        <p className="md-room-ready-copy">
                          <CheckCircle2 size={19} aria-hidden="true" /> Everyone is ready. Review
                          the food above, then lock the order.
                        </p>
                      )}
                      <button
                        type="button"
                        className="md-room-button"
                        disabled={
                          busy ||
                          !room.canFinalize ||
                          !groupHasFood ||
                          !identity.ready ||
                          !!draft?.dirty
                        }
                        onClick={() => openDialog({ kind: "finalize", revision: room.revision })}
                      >
                        <LockKeyhole size={18} aria-hidden="true" /> Review & lock for payment
                      </button>
                      <p className="md-room-fine">
                        The final price and any eligible offer are checked next. Locking the choices
                        does not charge a card.
                      </p>
                    </section>
                  )}
                  {payment && <GroupRoomBilling room={room} payment={payment} />}
                  {payment && !isOrganiser && organiserPays && paymentOpen && (
                    <section className="md-room-card">
                      <h2>Your organiser is taking care of payment.</h2>
                      <p>
                        Your choices are included. You don’t need to make a payment. This room
                        updates when the kitchen receives the fully paid order.
                      </p>
                    </section>
                  )}
                  {payment && isOrganiser && !organiserPays && !ownShare && paymentOpen && (
                    <section className="md-room-card">
                      <h2>You’re just organising.</h2>
                      <p>
                        No personal payment is due from you. Each person pays for their own food,
                        and the complete order goes to the kitchen automatically.
                      </p>
                    </section>
                  )}
                  {needsIdentity && (
                    <PaymentIdentity
                      identity={identity}
                      roomId={room.roomId}
                      disabled={busy}
                      returnTo="/group-order"
                      onRememberRoom={() => {
                        rememberGroupOrderRoom(room.roomId);
                      }}
                      onGuestSaved={() => {
                        void refreshRoom();
                      }}
                    />
                  )}
                  {paymentOpen && (organiserPays ? isOrganiser : !!ownShare) && (
                    <section
                      className="md-room-card md-room-payment-action"
                      aria-labelledby="room-pay-heading"
                    >
                      <span className="md-room-kicker">Secure payment</span>
                      <h2 id="room-pay-heading">
                        {organiserPays ? "Pay for everyone" : "Pay for your food"}
                      </h2>
                      {ownShare?.status === "paid" && !organiserPays ? (
                        <p className="md-room-ready-copy">
                          <CheckCircle2 size={21} aria-hidden="true" /> Your payment is confirmed.
                          Waiting for the rest of the group.
                        </p>
                      ) : (
                        <>
                          {canOwnPay && (
                            <button
                              type="button"
                              className="md-room-button"
                              onClick={() =>
                                openDialog({
                                  kind: "pay",
                                  amountPence: payAmount,
                                  coverRemaining: !!organiserPays,
                                })
                              }
                            >
                              Review & pay {formatLaunchMenuPrice(payAmount)}
                              <ArrowRight size={18} aria-hidden="true" />
                            </button>
                          )}
                          {!identity.ready && (
                            <p className="md-room-muted">
                              Choose your member or guest details above to pay.
                            </p>
                          )}
                          {identity.ready && !payment.canPay && resumes.length === 0 && (
                            <p className="md-room-notice">
                              {ownShare?.status === "processing"
                                ? "Your payment is being checked. Keep this room open for confirmation."
                                : payment.message ||
                                  "New payments are not available right now. Existing payment progress remains visible."}
                            </p>
                          )}
                          {resumes.map((resume) => (
                            <div className="md-room-resume" key={resume.attemptId}>
                              <p>
                                A payment of {formatLaunchMenuPrice(resume.amountPence)} was already
                                started. Continue that same payment.
                              </p>
                              <button
                                type="button"
                                className="md-room-button md-room-button-light"
                                disabled={!identity.ready || busy}
                                onClick={() => openDialog({ kind: "pay", ...resume })}
                              >
                                Review & continue payment
                              </button>
                            </div>
                          ))}
                        </>
                      )}
                      <button
                        type="button"
                        className="md-room-text-button"
                        disabled={busy}
                        onClick={() => {
                          void run({ action: "reconcile", roomId: room.roomId });
                        }}
                      >
                        <RefreshCw size={16} aria-hidden="true" /> Check payment confirmation
                      </button>
                      <p className="md-room-fine">
                        We confirm payments with the payment provider. Returning from checkout on
                        its own does not mark a bill as paid.
                      </p>
                    </section>
                  )}
                </>
              )}
              {collecting && !isOrganiser && !inactive && (
                <button
                  type="button"
                  className="md-room-text-button"
                  disabled={busy}
                  onClick={() => openDialog({ kind: "leave" })}
                >
                  I’m not ordering — leave room
                </button>
              )}
              {isOrganiser && !room.closedAt && room.phase !== "cancelled" && (collecting || payment?.canCancel) && (
                <button
                  type="button"
                  className="md-room-text-button"
                  disabled={busy || !identity.ready}
                  onClick={() => openDialog({ kind: "cancel" })}
                >
                  Cancel group order
                </button>
              )}
              {(room.phase === "cancelled" || inactive || room.closedAt || payment?.status === "paid") && (
                <button
                  type="button"
                  className="md-room-button md-room-button-light"
                  disabled={busy || !!draft?.dirty}
                  onClick={startNewRoom}
                >
                  {newRoomsOpen ? "Start a new room" : "Check group room availability"}
                </button>
              )}
            </div>
            <RoomRoster
              room={room}
              invites={result?.inviteLinks ?? []}
              now={now}
              busy={busy}
              onDialog={openDialog}
            />
          </div>
        )}
      </main>
      <SiteFooter />
      <Dialog
        open={!!dialog}
        onOpenChange={(open) => {
          if (!open && !busy) setDialog(null);
        }}
      >
        <DialogContent
          className="md-room-dialog"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const target = mutationOpener.current?.isConnected
              ? mutationOpener.current
              : heading.current;
            target?.focus({ preventScroll: true });
          }}
        >
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>
            {dialog?.kind === "remove"
              ? `${dialog.name}’s invitation and food choices will be removed from this order.`
              : dialog?.kind === "close"
                ? "Any invitations that haven’t been accepted will close. People already in the room keep their choices and their place."
                : dialog?.kind === "leave"
                  ? "Your food will be removed. This invitation cannot be used to rejoin after you leave."
                  : dialog?.kind === "cancel"
                    ? "The group will stop ordering and taking new payments. Existing payments will be checked; a refund is only confirmed when the payment provider records it."
                    : dialog?.kind === "discard"
                      ? "Your unsaved local changes will be replaced with your choices currently saved in the room."
                      : dialog?.kind === "finalize"
                        ? "Everyone’s saved choices and names will be fixed for this order. The final itemised price is checked next, before anyone pays."
                        : "Review the food, extras and final bill above. You’ll continue to secure checkout for this payment."}
          </DialogDescription>
          {issue && (
            <p className="md-room-error" role="alert">
              {issue}
              {dialog?.kind === "pay" ? " Retrying continues the same payment request." : ""}
            </p>
          )}
          {dialog?.kind === "pay" && !dialogPaymentAllowed && (
            <p className="md-room-notice">
              Payment progress has changed. Close this window and check the latest payment status
              before continuing.
            </p>
          )}
          {dialog?.kind === "finalize" && room?.revision !== dialog.revision && (
            <p className="md-room-notice">
              The room changed while you were reviewing. Close this window and review the latest
              group choices.
            </p>
          )}
          {(dialog?.kind === "pay" || dialog?.kind === "finalize") && (
            <label className="md-room-checkbox">
              <input
                type="checkbox"
                checked={reviewed}
                disabled={busy}
                onChange={(event) => setReviewed(event.target.checked)}
              />
              <span>
                {dialog.kind === "pay"
                  ? `I’ve reviewed the itemised food and ${formatLaunchMenuPrice(dialog.amountPence)} payment.`
                  : "I’ve reviewed the names, food choices and collection details."}
              </span>
            </label>
          )}
          <div className="md-room-actions">
            <button
              type="button"
              className="md-room-button md-room-button-light"
              disabled={busy}
              onClick={() => setDialog(null)}
            >
              Go back
            </button>
            <button
              type="button"
              className="md-room-button"
              disabled={
                busy ||
                ((dialog?.kind === "pay" || dialog?.kind === "finalize") && !reviewed) ||
                (dialog?.kind === "finalize" &&
                  (!room?.canFinalize || room.revision !== dialog.revision)) ||
                (dialog?.kind === "pay" && !dialogPaymentAllowed)
              }
              onClick={() => {
                void confirmDialog();
              }}
            >
              {busy
                ? "Please wait…"
                : dialog?.kind === "pay"
                  ? "Continue to secure payment"
                  : dialog?.kind === "finalize"
                    ? "Lock choices & check final price"
                    : dialog?.kind === "discard"
                      ? "Use saved choices"
                      : "Confirm"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={navigation.status === "blocked"}
        onOpenChange={(open) => {
          if (!open) navigation.reset?.();
        }}
      >
        <DialogContent className="md-room-dialog">
          <DialogTitle>Leave your unsaved choices?</DialogTitle>
          <DialogDescription>
            Your latest changes have not been saved to the room. Stay here to save them, or leave
            and keep only your previously saved choices.
          </DialogDescription>
          <div className="md-room-actions">
            <button type="button" className="md-room-button" onClick={() => navigation.reset?.()}>
              Stay & save my choices
            </button>
            <button
              type="button"
              className="md-room-button md-room-button-light"
              onClick={() => navigation.proceed?.()}
            >
              Leave without saving
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
