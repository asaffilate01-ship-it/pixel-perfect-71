import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Bell, Eye, RefreshCw, Send, X } from "lucide-react";
import { getMealDeckOpsClient } from "@/lib/mealdeck-ops-browser";
import {
  canConfirmNotificationCampaign,
  requestNotificationCampaigns,
  type NotificationCampaign,
  type NotificationCampaignInput,
} from "@/lib/mealdeck-notification-campaigns-browser";
import "./notification-campaign-panel.css";

const statusLabels: Record<string, string> = {
  draft: "Draft — awaiting your send action",
  queued: "Queued for sending",
  completed: "Sending finished",
  cancelled: "Cancelled",
  expired: "Expired",
};
function expiryLabel(expiresAt: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(expiresAt));
}

export function NotificationCampaignPanel({
  tenantId,
  locationId,
  staffUserId,
}: {
  tenantId: string;
  locationId: string;
  staffUserId: string;
}) {
  const id = useId();
  const previewRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const refreshRef = useRef<HTMLButtonElement>(null);
  const restoreEditorFocus = useRef(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [path, setPath] = useState<"/offers" | "/menus">("/offers");
  const [expiryHours, setExpiryHours] = useState(6);
  const [campaigns, setCampaigns] = useState<NotificationCampaign[]>([]);
  const [selected, setSelected] = useState<NotificationCampaign | null>(null);
  const [available, setAvailable] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<NotificationCampaignInput["action"] | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const generation = useRef(0);
  const running = useRef(false);
  const controller = useRef<AbortController | null>(null);

  const perform = useCallback(
    async (input: NotificationCampaignInput) => {
      if (running.current) return;
      running.current = true;
      const requestId = ++generation.current;
      const requestController = new AbortController();
      controller.current?.abort();
      controller.current = requestController;
      setBusy(input.action);
      setError("");
      setMessage("");
      try {
        const client = getMealDeckOpsClient();
        const session = await client.auth.getSession();
        if (session.error || session.data.session?.user.id !== staffUserId)
          throw new Error(
            "Your staff account changed. Sign in again to manage offer notifications.",
          );
        const result = await requestNotificationCampaigns(
          input,
          async () => session.data.session?.access_token ?? null,
          requestController.signal,
        );
        const current = await client.auth.getSession();
        if (
          getMealDeckOpsClient() !== client ||
          current.error ||
          current.data.session?.user.id !== staffUserId
        )
          throw new Error(
            "Your staff account changed. Sign in again to manage offer notifications.",
          );
        if (requestController.signal.aborted || requestId !== generation.current) return;
        setAvailable(result.available);
        setLoaded(true);
        if (input.action === "list") {
          setCampaigns(result.campaigns);
          setSelected((previous) =>
            previous
              ? (result.campaigns.find((campaign) => campaign.campaignId === previous.campaignId) ??
                null)
              : null,
          );
        } else if (result.campaign) {
          const campaign = result.campaign;
          setCampaigns((previous) => [
            campaign,
            ...previous.filter((row) => row.campaignId !== campaign.campaignId),
          ]);
          if (input.action === "prepare") {
            setSelected(campaign);
            setMessage("Draft saved. Review the exact notification below before sending.");
          } else if (input.action === "confirm") {
            setSelected(campaign);
            setMessage(
              campaign.status === "queued"
                ? "Campaign queued. Current preferences are checked again before each notification is sent."
                : "Campaign status updated. Check its status before taking another action.",
            );
          } else if (campaign.status === "cancelled" || campaign.status === "expired") {
            restoreEditorFocus.current = true;
            setSelected(null);
            setMessage(
              campaign.queued === 0
                ? "Draft discarded."
                : "Pending notifications stopped. Alerts already accepted by a push service cannot be recalled.",
            );
          } else if (campaign.status === "completed") {
            setSelected(campaign);
            setMessage(
              "Sending has already finished. Alerts accepted by a push service cannot be recalled.",
            );
          } else {
            setSelected(campaign);
            throw new Error(
              "Cancellation could not be confirmed. Refresh this campaign before trying again.",
            );
          }
        }
      } catch (reason) {
        if (requestController.signal.aborted || requestId !== generation.current) return;
        setError(
          reason instanceof Error
            ? reason.message
            : "The campaign could not be updated. Refresh its status and try again.",
        );
      } finally {
        if (requestId === generation.current) {
          running.current = false;
          setBusy(null);
        }
      }
    },
    [staffUserId],
  );

  const refresh = useCallback(
    () => perform({ action: "list", tenantId, locationId }),
    [perform, tenantId, locationId],
  );
  useEffect(() => {
    void refresh();
    return () => {
      generation.current += 1;
      controller.current?.abort();
      running.current = false;
    };
  }, [refresh]);
  const selectedId = selected?.campaignId;
  const selectedStatus = selected?.status;
  const noEligiblePhones =
    loaded &&
    available &&
    campaigns.length > 0 &&
    campaigns.every((campaign) => campaign.eligibleDevices === 0);
  const draftTooOld = Boolean(
    selected?.status === "draft" && Date.parse(selected.createdAt) + 15 * 60_000 <= Date.now(),
  );
  useEffect(() => {
    if (selectedId) previewRef.current?.focus();
  }, [selectedId, selectedStatus]);
  useEffect(() => {
    if (!selectedId && busy === null && restoreEditorFocus.current) {
      (titleRef.current?.disabled ? refreshRef.current : titleRef.current)?.focus();
      restoreEditorFocus.current = false;
    }
  }, [selectedId, busy]);

  function prepare(event: FormEvent) {
    event.preventDefault();
    if (!loaded || !title.trim() || !body.trim() || selected) return;
    void perform({
      action: "prepare",
      tenantId,
      locationId,
      title: title.replace(/\s+/g, " ").trim(),
      body: body.replace(/\s+/g, " ").trim(),
      path,
      expiresAt: new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString(),
    });
  }

  return (
    <section
      className="md-ops-card md-notification-campaigns"
      aria-labelledby={`${id}-heading`}
      aria-busy={busy !== null}
    >
      <header className="md-notification-campaigns-header">
        <div>
          <h2 id={`${id}-heading`}>
            <Bell size={21} aria-hidden="true" /> Offers &amp; app notifications
          </h2>
          <p>
            Send an offer to members who chose promotional app notifications. Order alerts have
            their own preference.
          </p>
        </div>
        <button
          type="button"
          className="md-ops-button"
          ref={refreshRef}
          disabled={busy !== null}
          onClick={() => {
            void refresh();
          }}
        >
          <RefreshCw size={17} aria-hidden="true" />
          {busy === "list" ? "Refreshing…" : "Refresh campaigns"}
        </button>
      </header>
      {error && (
        <p className="md-ops-status md-ops-status-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="md-ops-status" role="status">
          {message}
        </p>
      )}
      {!loaded && busy === "list" && (
        <p role="status">Checking campaign access and notification availability…</p>
      )}
      {loaded && !available && (
        <p className="md-notification-campaigns-unavailable">
          Offer notifications are still being connected. You can prepare and review drafts while the
          connection gets ready. Sending is currently unavailable.
        </p>
      )}
      {noEligiblePhones && (
        <p className="md-notification-campaigns-unavailable" role="status">
          <strong>Currently, no opted-in phone is subscribed.</strong>{" "}
          <span>Members must enable App offers and allow phone notifications.</span>
        </p>
      )}
      {selected ? (
        <div
          className="md-notification-campaign-review"
          tabIndex={-1}
          ref={previewRef}
          aria-label="Saved notification preview"
        >
          <div className="md-notification-campaign-preview">
            <span className="md-notification-campaign-brand">
              <Bell size={16} aria-hidden="true" /> MealDeck
            </span>
            <h3>{selected.title}</h3>
            <p>{selected.body}</p>
          </div>
          <dl className="md-notification-campaign-details">
            <div>
              <dt>Opens</dt>
              <dd>{selected.path === "/offers" ? "MealDeck offers" : "MealDeck menus"}</dd>
            </div>
            <div>
              <dt>Send before</dt>
              <dd>{expiryLabel(selected.expiresAt)} London time</dd>
            </div>
            <div>
              <dt>Eligible devices</dt>
              <dd>{selected.eligibleDevices.toLocaleString("en-GB")}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                {statusLabels[selected.status] ?? "Status unavailable — refresh before continuing"}
              </dd>
            </div>
          </dl>
          {selected.status === "draft" ? (
            <>
              <p className="md-notification-campaign-fine">
                This is the saved draft. Only members who still allow offer notifications at send
                time can receive it.
              </p>
              {selected.eligibleDevices === 0 && (
                <p role="status">
                  No eligible devices are subscribed. Members must enable App offers and phone
                  notifications. Prepare a fresh draft once connected.
                </p>
              )}
              {draftTooOld && (
                <p role="status">This draft has expired. Create and review a new draft to send.</p>
              )}
              <div className="md-notification-campaign-actions">
                <button
                  type="button"
                  className="md-ops-button md-ops-primary"
                  disabled={busy !== null || !canConfirmNotificationCampaign(selected, available)}
                  onClick={() => {
                    void perform({
                      action: "confirm",
                      tenantId,
                      locationId,
                      campaignId: selected.campaignId,
                    });
                  }}
                >
                  <Send size={17} aria-hidden="true" />
                  {busy === "confirm" ? "Queueing campaign…" : "Send to opted-in devices"}
                </button>
                <button
                  type="button"
                  className="md-ops-button"
                  disabled={busy !== null}
                  onClick={() => {
                    void perform({
                      action: "cancel",
                      tenantId,
                      locationId,
                      campaignId: selected.campaignId,
                    });
                  }}
                >
                  <X size={17} aria-hidden="true" /> Discard draft
                </button>
              </div>
            </>
          ) : (
            <>
              <CampaignCounts campaign={selected} />
              <div className="md-notification-campaign-actions">
                {selected.status === "queued" && (
                  <button
                    type="button"
                    className="md-ops-button"
                    disabled={busy !== null}
                    onClick={() => {
                      void perform({
                        action: "cancel",
                        tenantId,
                        locationId,
                        campaignId: selected.campaignId,
                      });
                    }}
                  >
                    <X size={17} aria-hidden="true" /> Stop pending notifications
                  </button>
                )}
                <button
                  type="button"
                  className="md-ops-button"
                  disabled={busy !== null}
                  onClick={() => {
                    restoreEditorFocus.current = true;
                    setSelected(null);
                    setTitle("");
                    setBody("");
                    setMessage("");
                  }}
                >
                  New campaign
                </button>
              </div>
            </>
          )}
          {selected.status === "draft" && (
            <button
              type="button"
              className="md-notification-campaign-link"
              disabled={busy !== null}
              onClick={() => {
                restoreEditorFocus.current = true;
                setSelected(null);
                if (draftTooOld) {
                  setTitle("");
                  setBody("");
                }
                setMessage(
                  draftTooOld
                    ? "Create a new draft. The previous one cannot be sent."
                    : "Draft kept. You can review it again below.",
                );
              }}
            >
              {draftTooOld ? "Start a fresh draft" : "Keep draft for later"}
            </button>
          )}
        </div>
      ) : (
        <form onSubmit={prepare} className="md-notification-campaign-form">
          <label htmlFor={`${id}-title`}>
            Notification title
            <input
              id={`${id}-title`}
              ref={titleRef}
              className="md-ops-field"
              maxLength={60}
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={busy !== null || !loaded}
              placeholder="Your offer headline"
              autoComplete="off"
            />
          </label>
          <label htmlFor={`${id}-body`}>
            Message
            <textarea
              id={`${id}-body`}
              className="md-ops-field"
              maxLength={180}
              required
              rows={3}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              disabled={busy !== null || !loaded}
              aria-describedby={`${id}-copy-guidance`}
              placeholder="Use the approved offer terms."
            />
          </label>
          <p id={`${id}-copy-guidance`} className="md-notification-campaign-fine">
            {body.length} / 180 characters. Keep the offer accurate and choose an expiry within its
            promotion period.
          </p>
          <div className="md-notification-campaign-fields">
            <label htmlFor={`${id}-path`}>
              When tapped, open
              <select
                id={`${id}-path`}
                className="md-ops-field"
                value={path}
                disabled={busy !== null || !loaded}
                onChange={(event) =>
                  setPath(event.target.value === "/menus" ? "/menus" : "/offers")
                }
              >
                <option value="/offers">Offers page</option>
                <option value="/menus">Menus page</option>
              </select>
            </label>
            <label htmlFor={`${id}-expiry`}>
              Stop sending after
              <select
                id={`${id}-expiry`}
                className="md-ops-field"
                value={expiryHours}
                disabled={busy !== null || !loaded}
                onChange={(event) =>
                  setExpiryHours(
                    [1, 6, 24].includes(Number(event.target.value))
                      ? Number(event.target.value)
                      : 6,
                  )
                }
              >
                <option value={1}>1 hour</option>
                <option value={6}>6 hours</option>
                <option value={24}>24 hours</option>
              </select>
            </label>
          </div>
          <button
            type="submit"
            className="md-ops-button md-ops-primary"
            disabled={busy !== null || !loaded || !title.trim() || !body.trim()}
          >
            <Eye size={18} aria-hidden="true" />{" "}
            {busy === "prepare" ? "Saving draft…" : "Save draft & preview"}
          </button>
        </form>
      )}
      <div className="md-notification-campaign-history">
        <h3>Recent campaigns</h3>
        {loaded && campaigns.length === 0 && (
          <p>No campaigns yet. Saving a draft does not send it.</p>
        )}
        {campaigns.length > 0 && (
          <ul>
            {campaigns.map((campaign) => (
              <li key={campaign.campaignId}>
                <div>
                  <strong>{campaign.title}</strong>
                  <p>{statusLabels[campaign.status] ?? "Status unavailable"}</p>
                </div>
                <button
                  type="button"
                  className="md-ops-button"
                  disabled={busy !== null}
                  aria-label={`Review campaign: ${campaign.title}`}
                  onClick={() => {
                    setSelected(campaign);
                    setMessage("");
                  }}
                >
                  Review
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="md-notification-campaign-fine">
        “Push service accepted” confirms the notification was accepted for delivery. It does not
        confirm it appeared on a phone or was read.
      </p>
    </section>
  );
}

function CampaignCounts({ campaign }: { campaign: NotificationCampaign }) {
  return (
    <dl className="md-notification-campaign-counts">
      <div>
        <dt>Queued</dt>
        <dd>{campaign.queued.toLocaleString("en-GB")}</dd>
      </div>
      <div>
        <dt>Push service accepted</dt>
        <dd>{campaign.accepted.toLocaleString("en-GB")}</dd>
      </div>
      <div>
        <dt>Failed</dt>
        <dd>{campaign.failed.toLocaleString("en-GB")}</dd>
      </div>
      <div>
        <dt>Skipped</dt>
        <dd>{campaign.skipped.toLocaleString("en-GB")}</dd>
      </div>
    </dl>
  );
}
