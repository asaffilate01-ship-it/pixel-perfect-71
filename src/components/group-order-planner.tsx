import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Link2,
  Plus,
  Search,
  Share2,
  ShoppingBag,
  Trash2,
  Users,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { MealDeckLogo } from "@/components/mealdeck-logo";
import {
  LaunchItemCustomiser,
  type LaunchItemDraft,
  type LaunchMenuEntry,
} from "@/components/menus/launch-item-customiser";
import { approvedBrandLogos, type ApprovedBrandId } from "@/lib/brand-logos";
import { getLaunchMenuBrand, isLaunchBrandPriceApproved } from "@/lib/launch-menu-catalogue";
import {
  formatLaunchMenuPrice,
  launchMenuBasketDisplayPrice,
  launchMenuPickDisplayPrice,
} from "@/lib/launch-menu-display-prices";
import {
  addLaunchPick,
  decodeLaunchPicks,
  findLaunchMenuItem,
  LAUNCH_PICKS_STORAGE_KEY,
  launchPickCount,
  launchSelectionLabels,
  setLaunchPickQuantity,
  updateLaunchPick,
  type LaunchMenuPick,
  type LaunchMenuSelections,
} from "@/lib/launch-menu-picks";
import {
  launchCrossSelectionSummaries,
  type LaunchCrossSelection,
} from "@/lib/launch-menu-upsells";
import { prepareGroupCheckout } from "@/lib/launch-basket-transfer";
import {
  acceptGroupReply,
  addGroupPerson,
  buildGroupCheckout,
  createGroupPlan,
  groupInvitation,
  groupPlanCount,
  GROUP_PLAN_STORAGE_KEY,
  inspectGroupReply,
  makeGroupLink,
  makeGroupReply,
  MAX_GROUP_PEOPLE,
  MAX_GROUP_LINK_LENGTH,
  parseGroupLink,
  removeGroupPerson,
  updateOrganiserPicks,
  type GroupInvitation,
  type GroupLink,
  type GroupPlan,
  type GroupReply,
} from "@/lib/mealdeck-group-plan";
import {
  assertStoredGroupPlanCurrent,
  readGroupReplyDraft,
  readStoredGroupPlan,
  saveGroupReplyDraft,
  saveStoredGroupPlan,
  type StoredGroupPlan,
} from "@/lib/mealdeck-group-storage";

const brandIds = ["skorch-burgers", "tavo-chicken", "souvano", "loadd", "moktl"];
function logoFor(id: string) {
  return approvedBrandLogos[(id === "skorch-burgers" ? "skorch" : id) as ApprovedBrandId];
}
function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "That change could not be saved. Please try again.";
}
function focusVisible(element: HTMLElement | null, scroll = false) {
  if (!element?.isConnected || !element.getClientRects().length) return false;
  if (scroll) element.scrollIntoView({ block: "nearest" });
  element.focus({ preventScroll: true });
  return true;
}

function GroupChoices({
  picks,
  onEdit,
  onRemove,
}: {
  picks: LaunchMenuPick[];
  onEdit?: (pick: LaunchMenuPick) => void;
  onRemove?: (pick: LaunchMenuPick) => void;
}) {
  return (
    <ul className="md-group-choices">
      {picks.map((pick) => {
        const found = findLaunchMenuItem(pick.brandId, pick.itemId);
        if (!found) return null;
        const choices = [
          ...launchSelectionLabels(found.brand, found.item, pick.selections, pick.crossSelections),
          ...launchCrossSelectionSummaries(
            found.brand,
            found.item,
            pick.selections,
            pick.crossSelections,
          ).map((choice) => choice.label),
        ];
        return (
          <li key={pick.key}>
            <div className="md-group-choice-copy">
              <span className="md-group-muted">{found.brand.name}</span>
              <strong>
                {pick.quantity} × {found.item.name}
              </strong>
              {choices.length > 0 && <p>{choices.join(" · ")}</p>}
              <span>
                {formatLaunchMenuPrice(launchMenuPickDisplayPrice(pick).itemsSubtotalPence)}
              </span>
            </div>
            {(onEdit || onRemove) && (
              <div className="md-group-choice-actions">
                {onEdit && (
                  <button
                    type="button"
                    onClick={() => onEdit(pick)}
                    aria-label={"Edit " + found.item.name}
                  >
                    Edit
                  </button>
                )}
                {onRemove && (
                  <button
                    type="button"
                    onClick={() => onRemove(pick)}
                    aria-label={"Remove " + found.item.name}
                  >
                    <Trash2 size={18} aria-hidden="true" />
                    <span className="sr-only">Remove</span>
                  </button>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ShareGroupLink({
  value,
  title,
  description,
}: {
  value: string;
  title: string;
  description: string;
}) {
  const [message, setMessage] = useState("");
  const [canShare, setCanShare] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    setCanShare(typeof navigator.share === "function");
  }, []);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setMessage("Link copied. Send it in your own message.");
    } catch {
      input.current?.focus();
      input.current?.select();
      setMessage("Select and copy the link below, then send it in your own message.");
    }
  }
  async function share() {
    try {
      await navigator.share({ title, text: description, url: value });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        setMessage("Sharing did not open. Copy the link below instead.");
    }
  }
  return (
    <div className="md-group-share">
      <p>{description}</p>
      <div className="md-group-actions">
        <button
          type="button"
          className="md-group-button"
          onClick={() => {
            void copy();
          }}
        >
          <Copy size={18} aria-hidden="true" />
          Copy link
        </button>
        {canShare && (
          <button
            type="button"
            className="md-group-button md-group-button-light"
            onClick={() => {
              void share();
            }}
          >
            <Share2 size={18} aria-hidden="true" />
            Share link
          </button>
        )}
      </div>
      <label className="md-group-link-label">
        {title}
        <textarea
          ref={input}
          value={value}
          readOnly
          rows={2}
          spellCheck={false}
          onFocus={(event) => event.currentTarget.select()}
        />
      </label>
      <p className="md-group-feedback" role="status">
        {message}
      </p>
    </div>
  );
}

function LinkPrivacy() {
  return (
    <p className="md-group-privacy">
      Keep these links private. Anyone with an invitation can prepare a reply for that person; a
      reply link reveals their food choices. Names and contact details are not included. Links do
      not update automatically—send a new reply after changing choices.
    </p>
  );
}

/** The same customiser and catalogue as the normal menu, with an independent draft. */
function GroupMenuComposer({
  picks,
  onChange,
  onDone,
  autoFocus = false,
}: {
  picks: LaunchMenuPick[];
  onChange: (next: LaunchMenuPick[]) => void;
  onDone?: () => void;
  autoFocus?: boolean;
}) {
  const [brandId, setBrandId] = useState("skorch-burgers");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<LaunchItemDraft | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [savedBasket, setSavedBasket] = useState<LaunchMenuPick[] | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const savedBasketOpener = useRef<HTMLElement | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const choicesHeading = useRef<HTMLHeadingElement>(null);
  const brand = getLaunchMenuBrand(brandId)!;
  const query = search.trim().toLocaleLowerCase("en-GB");
  const sections = brand.sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) =>
        [item.name, item.description, section.title]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("en-GB")
          .includes(query),
      ),
    }))
    .filter((section) => section.items.length);
  useEffect(() => {
    if (!autoFocus) return;
    heading.current?.scrollIntoView({ block: "start" });
    heading.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  function openItem(entry: LaunchMenuEntry, existing?: LaunchMenuPick) {
    returnFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setError("");
    setDraft({ ...entry, ...(existing ? { existing } : {}) });
  }
  function save(
    selections: LaunchMenuSelections,
    quantity: number,
    crossSelections: LaunchCrossSelection[],
  ) {
    if (!draft) return;
    const next = draft.existing
      ? updateLaunchPick(picks, draft.existing.key, selections, quantity, crossSelections)
      : addLaunchPick(picks, draft.brand.id, draft.item.id, selections, quantity, crossSelections);
    if (next === picks) {
      setError(
        "Check the required choices and keep the group to 60 selections, with up to 20 of one exact dish.",
      );
      return;
    }
    try {
      onChange(next);
      setNotice(draft.item.name + (draft.existing ? " updated." : " added to your group choices."));
      setDraft(null);
    } catch (problem) {
      setError(errorMessage(problem));
    }
  }
  function replaceWithSaved(next: LaunchMenuPick[]) {
    try {
      onChange(next);
      setSavedBasket(null);
      setNotice(
        "Your saved basket has been copied into these choices. Your personal basket is unchanged.",
      );
    } catch (problem) {
      setError(errorMessage(problem));
    }
  }
  function copySaved() {
    setError("");
    savedBasketOpener.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    try {
      const next = decodeLaunchPicks(localStorage.getItem(LAUNCH_PICKS_STORAGE_KEY));
      if (!next.length) {
        setNotice("There are no saved menu choices on this browser yet.");
        return;
      }
      if (picks.length) setSavedBasket(next);
      else replaceWithSaved(next);
    } catch {
      setNotice("This browser could not read your saved basket. You can choose food below.");
    }
  }
  return (
    <section className="md-group-composer" aria-label="Choose food for your group bag">
      <div className="md-group-section-heading">
        <div>
          <span className="md-group-kicker">Your part of the order</span>
          <h2 ref={heading} tabIndex={-1}>
            Pick your food.
          </h2>
          <p>Your choices here are separate from your personal menu basket.</p>
        </div>
        {onDone && (
          <button type="button" className="md-group-button md-group-button-light" onClick={onDone}>
            Done choosing <Check size={18} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="md-group-actions">
        <button type="button" className="md-group-button md-group-button-light" onClick={copySaved}>
          Copy my saved basket
        </button>
        <button
          type="button"
          className="md-group-button md-group-button-light"
          onClick={() => {
            choicesHeading.current?.scrollIntoView({ block: "start" });
            choicesHeading.current?.focus({ preventScroll: true });
          }}
        >
          <ShoppingBag size={18} aria-hidden="true" />
          My choices ({launchPickCount(picks)})
        </button>
      </div>
      <nav className="md-group-brands" aria-label="Choose a menu">
        {brandIds.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={brandId === id}
            onClick={() => {
              setBrandId(id);
              setSearch("");
            }}
          >
            <img src={logoFor(id)} alt="" width={90} height={60} />
            <span>{getLaunchMenuBrand(id)!.name}</span>
          </button>
        ))}
      </nav>
      <label className="md-group-search">
        <Search size={19} aria-hidden="true" />
        <span className="sr-only">Search {brand.name}</span>
        <input
          type="search"
          placeholder={"Search " + brand.name}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      {sections.length ? (
        sections.map((section) => (
          <section className="md-group-menu-section" key={section.id}>
            <h3>{section.title}</h3>
            <div className="md-group-dishes">
              {section.items.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  disabled={!isLaunchBrandPriceApproved(brand.id)}
                  onClick={() => openItem({ brand, section, item })}
                >
                  <span>
                    <strong>{item.name}</strong>
                    {item.description && <small>{item.description}</small>}
                    <span className="md-group-dish-price">
                      {item.priceVariants?.length ? "From " : ""}
                      {formatLaunchMenuPrice(item.pricePence)}
                    </span>
                  </span>
                  <Plus size={20} aria-hidden="true" />
                  <span className="sr-only">Choose {item.name}</span>
                </button>
              ))}
            </div>
          </section>
        ))
      ) : (
        <p className="md-group-empty" role="status">
          No dishes match that search. Try another word or menu.
        </p>
      )}
      <section className="md-group-own-choices">
        <h3 ref={choicesHeading} tabIndex={-1}>
          Your choices ({launchPickCount(picks)})
        </h3>
        {picks.length ? (
          <GroupChoices
            picks={picks}
            onEdit={(pick) => {
              const entry = findLaunchMenuItem(pick.brandId, pick.itemId);
              if (entry) openItem(entry, pick);
            }}
            onRemove={(pick) => {
              try {
                onChange(setLaunchPickQuantity(picks, pick.key, 0));
                setNotice("Item removed from your group choices.");
                choicesHeading.current?.focus({ preventScroll: true });
              } catch (problem) {
                setError(errorMessage(problem));
              }
            }}
          />
        ) : (
          <p>No food chosen yet. Pick a dish above to add flavours, portions and extras.</p>
        )}
        <p className="md-group-subtotal">
          <span>Menu subtotal</span>
          <strong>
            {formatLaunchMenuPrice(launchMenuBasketDisplayPrice(picks).itemsSubtotalPence)}
          </strong>
        </p>
        <p className="md-group-muted">
          Current menu prices for planning. The organiser reviews the kitchen’s final total,
          availability and any eligible offer at checkout.
        </p>
        {onDone && (
          <button type="button" className="md-group-button" onClick={onDone}>
            Done choosing <ArrowRight size={18} aria-hidden="true" />
          </button>
        )}
      </section>
      <p className="md-group-feedback" role="status">
        {notice}
      </p>
      {error && !draft && (
        <p className="md-group-error" role="alert">
          {error}
        </p>
      )}
      <Dialog
        open={!!draft}
        onOpenChange={(open) => {
          if (!open) setDraft(null);
        }}
      >
        <DialogContent
          className="lm-dialog lm-customise-dialog"
          overlayClassName="lm-dialog-overlay"
          data-menu-brand={draft?.brand.id}
          style={{ "--lm-accent": draft?.brand.accent ?? "#951018" } as CSSProperties}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const target = returnFocus.current?.isConnected
              ? returnFocus.current
              : choicesHeading.current;
            target?.focus({ preventScroll: true });
          }}
        >
          {draft && (
            <LaunchItemCustomiser
              key={draft.item.id + (draft.existing?.key ?? "new")}
              draft={draft}
              onSave={save}
              onBack={() => setDraft(null)}
              error={error}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!savedBasket}
        onOpenChange={(open) => {
          if (!open) setSavedBasket(null);
        }}
      >
        <DialogContent
          className="md-group-dialog"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (!focusVisible(savedBasketOpener.current, true))
              focusVisible(choicesHeading.current, true);
          }}
        >
          <DialogTitle>Replace these group choices?</DialogTitle>
          <DialogDescription>
            This copies your saved menu basket into this person’s choices. The choices shown here
            will be replaced; your personal menu basket stays saved.
          </DialogDescription>
          <div className="md-group-actions">
            <button
              type="button"
              className="md-group-button"
              onClick={() => {
                if (savedBasket) replaceWithSaved(savedBasket);
              }}
            >
              Replace choices
            </button>
            <button
              type="button"
              className="md-group-button md-group-button-light"
              onClick={() => setSavedBasket(null)}
            >
              Keep current choices
            </button>
          </div>
          {error && (
            <p className="md-group-error" role="alert">
              {error}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ParticipantPlanner({ invite, origin }: { invite: GroupInvitation; origin: string }) {
  const [picks, setPicks] = useState<LaunchMenuPick[]>([]);
  const [responseId, setResponseId] = useState("");
  const [saved, setSaved] = useState(true);
  const [ready, setReady] = useState(false);
  const [replyLink, setReplyLink] = useState("");
  const [error, setError] = useState("");
  const replyHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const restored = readGroupReplyDraft(invite);
    setPicks(restored?.picks ?? []);
    setResponseId(restored?.responseId ?? crypto.randomUUID());
    setSaved(restored?.saved ?? true);
    setReady(true);
  }, [invite]);
  function update(next: LaunchMenuPick[]) {
    const id = crypto.randomUUID();
    const stored = saveGroupReplyDraft(invite, next, id);
    setPicks(next);
    setResponseId(id);
    setSaved(stored.saved);
    setReplyLink("");
    setError("");
  }
  function createReply() {
    try {
      const link = makeGroupLink(makeGroupReply(invite, picks, responseId), origin);
      setReplyLink(link);
      setError("");
      requestAnimationFrame(() => {
        replyHeading.current?.scrollIntoView({ block: "start" });
        replyHeading.current?.focus({ preventScroll: true });
      });
    } catch (problem) {
      setError(errorMessage(problem));
    }
  }
  return (
    <>
      <section className="md-group-intro-card">
        <span className="md-group-kicker">You’re invited</span>
        <h1>Bring your craving to the group.</h1>
        <p>
          Choose your food, then send a reply link back to the person who invited you. They review
          everyone’s picks and pay in one checkout.
        </p>
        <p>
          <strong>Your choices are not sent automatically.</strong> This is a draft on this browser,
          not a live shared basket. No account is needed to choose.
        </p>
        <LinkPrivacy />
      </section>
      {!saved && (
        <p className="md-group-error" role="status">
          Your choices are here for this visit, but this browser could not save them. Keep this page
          open and copy your reply link before leaving.
        </p>
      )}
      {ready ? (
        <GroupMenuComposer picks={picks} onChange={update} />
      ) : (
        <p role="status">Restoring your choices…</p>
      )}
      <section className="md-group-card md-group-send">
        <h2 ref={replyHeading} tabIndex={-1}>
          Send your choices back.
        </h2>
        <p>
          {launchPickCount(picks)} selections · menu subtotal{" "}
          {formatLaunchMenuPrice(launchMenuBasketDisplayPrice(picks).itemsSubtotalPence)}. You won’t
          pay here.
        </p>
        <button
          type="button"
          className="md-group-button"
          onClick={createReply}
          disabled={!ready || !picks.length}
        >
          <Link2 size={19} aria-hidden="true" />
          Make my reply link
        </button>
        {error && (
          <p className="md-group-error" role="alert">
            {error}
          </p>
        )}
        {replyLink && (
          <ShareGroupLink
            key={replyLink}
            value={replyLink}
            title="Your private reply link"
            description="Send this link back to your organiser. If you change your choices, make and send a new reply link."
          />
        )}
        <p className="md-group-muted">
          The organiser can tell you when the order has actually been paid for. A reply link is not
          an order confirmation.
        </p>
      </section>
    </>
  );
}

function IncomingReply({
  plan,
  reply,
  onAccept,
  onDismiss,
}: {
  plan: GroupPlan;
  reply: GroupReply;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  let review: ReturnType<typeof inspectGroupReply> | null = null;
  let error = "";
  try {
    review = inspectGroupReply(plan, reply);
  } catch (problem) {
    error = errorMessage(problem);
  }
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.scrollIntoView({ block: "start" });
    heading.current?.focus({ preventScroll: true });
  }, [reply.responseId]);
  return (
    <section className="md-group-card md-group-reply-review" aria-label="Review a returned reply">
      <span className="md-group-kicker">Reply received in this browser</span>
      <h2 ref={heading} tabIndex={-1}>
        {review
          ? "Review " + review.person.label + "’s choices"
          : "This reply needs your attention"}
      </h2>
      {error && (
        <p className="md-group-error" role="alert">
          {error}
        </p>
      )}
      {review && (
        <>
          {review.status === "unchanged" ? (
            <>
              <p role="status">
                These choices are already in your draft. Nothing has been added twice.
              </p>
              {!review.person.reviewedResponseIds.includes(reply.responseId) && (
                <button type="button" className="md-group-button" onClick={onAccept}>
                  Confirm matching reply <Check size={18} aria-hidden="true" />
                </button>
              )}
            </>
          ) : review.status === "older" ? (
            <p role="status">
              This is an older reply you already reviewed. Your newer choices have been kept.
            </p>
          ) : (
            <>
              <p>
                {review.status === "replace"
                  ? "Accepting this reply replaces this person’s previous choices. It does not add a second set."
                  : "These choices will go into one separate numbered bag."}{" "}
                Check this is the latest reply from the person you invited; links do not verify
                identity.
              </p>
              {review.status === "replace" && (
                <details>
                  <summary>Previous choices ({launchPickCount(review.person.picks)})</summary>
                  <GroupChoices picks={review.person.picks} />
                </details>
              )}
              <h3>Returned choices ({launchPickCount(review.reply.picks)})</h3>
              <GroupChoices picks={review.reply.picks} />
              <p className="md-group-subtotal">
                <span>Menu subtotal for this person</span>
                <strong>
                  {formatLaunchMenuPrice(
                    launchMenuBasketDisplayPrice(review.reply.picks).itemsSubtotalPence,
                  )}
                </strong>
              </p>
              <button type="button" className="md-group-button" onClick={onAccept}>
                {review.status === "replace"
                  ? "Replace their previous choices"
                  : "Add these choices to the group"}
                <Check size={18} aria-hidden="true" />
              </button>
            </>
          )}
        </>
      )}
      <button type="button" className="md-group-button md-group-button-light" onClick={onDismiss}>
        Back to group draft
      </button>
    </section>
  );
}

export function GroupOrderPlanner() {
  const navigate = useNavigate();
  const [stored, setStored] = useState<StoredGroupPlan | null>(null);
  const [incoming, setIncoming] = useState<GroupLink | null>(null);
  const [origin, setOrigin] = useState("");
  const [issue, setIssue] = useState("");
  const [notice, setNotice] = useState("");
  const [personName, setPersonName] = useState("");
  const [invitePerson, setInvitePerson] = useState<string | null>(null);
  const [replyInput, setReplyInput] = useState("");
  const [choosing, setChoosing] = useState(false);
  const [confirmedRevision, setConfirmedRevision] = useState<number | null>(null);
  const [skipRevision, setSkipRevision] = useState<number | null>(null);
  const [removePerson, setRemovePerson] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [modalIssue, setModalIssue] = useState("");
  const organiserButton = useRef<HTMLButtonElement>(null);
  const groupHeading = useRef<HTMLHeadingElement>(null);
  const pageHeading = useRef<HTMLHeadingElement>(null);
  const issueHeading = useRef<HTMLDivElement>(null);
  const dialogOpener = useRef<HTMLElement | null>(null);
  const plan = stored?.plan ?? null;
  useEffect(() => {
    setOrigin(window.location.origin);
    setStored(readStoredGroupPlan());
    const readFragment = () => {
      if (!window.location.hash) {
        setIncoming(null);
        return;
      }
      try {
        setIncoming(parseGroupLink(window.location.hash, window.location.origin));
        setIssue("");
      } catch (problem) {
        setIncoming(null);
        setIssue(errorMessage(problem));
      }
    };
    readFragment();
    window.addEventListener("hashchange", readFragment);
    return () => window.removeEventListener("hashchange", readFragment);
  }, []);
  useEffect(() => {
    const changedElsewhere = (event: StorageEvent) => {
      if (
        event.storageArea === localStorage &&
        (event.key === GROUP_PLAN_STORAGE_KEY || event.key === null) &&
        event.newValue !== stored?.raw
      ) {
        setConfirmedRevision(null);
        setSkipRevision(null);
        setIssue("Your group draft changed in another tab. Reload this page before continuing.");
      }
    };
    window.addEventListener("storage", changedElsewhere);
    return () => window.removeEventListener("storage", changedElsewhere);
  }, [stored?.raw]);
  function persist(next: GroupPlan, replaceUnreadable = false) {
    const value = saveStoredGroupPlan(next, stored?.raw ?? null, replaceUnreadable);
    setStored(value);
    setIssue("");
    setConfirmedRevision(null);
    setSkipRevision(null);
  }
  function showIssue(message: string) {
    setIssue(message);
    requestAnimationFrame(() => focusVisible(issueHeading.current, true));
  }
  function restoreDraftFocus() {
    requestAnimationFrame(() => {
      const target = groupHeading.current ?? pageHeading.current;
      target?.scrollIntoView({ block: "start" });
      focusVisible(target);
    });
  }
  function openReset(opener: HTMLElement) {
    dialogOpener.current = opener;
    setModalIssue("");
    setResetOpen(true);
  }
  function closeDialogFocus(event: Event) {
    event.preventDefault();
    if (!focusVisible(dialogOpener.current, true))
      focusVisible(groupHeading.current ?? pageHeading.current, true);
  }
  function dismissIncoming() {
    setIncoming(null);
    setReplyInput("");
    void navigate({ to: "/group-order", replace: true, hash: "" });
    restoreDraftFocus();
  }
  function start() {
    try {
      persist(createGroupPlan(), !!stored?.error);
      setResetOpen(false);
      setChoosing(false);
      setInvitePerson(null);
      setNotice("Your group draft is ready. Add your own food and invite your friends.");
      dismissIncoming();
    } catch (problem) {
      if (resetOpen) setModalIssue(errorMessage(problem));
      else showIssue(errorMessage(problem));
    }
  }
  function addPerson(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!plan) return;
    try {
      const next = addGroupPerson(plan, personName);
      persist(next);
      setInvitePerson(next.people.at(-1)!.id);
      setPersonName("");
      setNotice("Person added. Copy their invitation below.");
    } catch (problem) {
      showIssue(errorMessage(problem));
    }
  }
  function reviewPasted(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const link = parseGroupLink(replyInput, origin);
      if (link.kind !== "reply")
        throw new Error(
          "That is an invitation. Ask your friend to choose their food and send their reply link.",
        );
      setIncoming(link);
      setIssue("");
    } catch (problem) {
      showIssue(errorMessage(problem));
    }
  }
  function acceptReply() {
    if (!plan || incoming?.kind !== "reply") return;
    try {
      const person = plan.people.find((entry) => entry.id === incoming.inviteId);
      persist(acceptGroupReply(plan, incoming));
      dismissIncoming();
      setNotice((person?.label ?? "Their") + "’s choices are saved in your group.");
    } catch (problem) {
      showIssue(errorMessage(problem));
    }
  }
  function proceedToCheckout() {
    if (!plan || confirmedRevision !== plan.revision) return;
    try {
      assertStoredGroupPlanCurrent(stored?.raw ?? null);
      prepareGroupCheckout(buildGroupCheckout(plan));
      void navigate({ to: "/checkout", search: { group: true } });
    } catch (problem) {
      showIssue(errorMessage(problem));
    }
  }
  let invitationLink = "";
  if (plan && invitePerson && origin) {
    try {
      invitationLink = makeGroupLink(groupInvitation(plan, invitePerson), origin);
    } catch {
      /* Removed invite. */
    }
  }
  const included = plan?.people.filter((person) => person.picks.length > 0) ?? [];
  const personSubtotals = included.map(
    (person) => launchMenuBasketDisplayPrice(person.picks).itemsSubtotalPence,
  );
  const groupSubtotal = personSubtotals.some((amount) => amount === null)
    ? null
    : personSubtotals.reduce<number>((total, amount) => total + amount!, 0);
  const waiting =
    plan?.people.filter((person) => person.id !== "organiser" && !person.picks.length) ?? [];
  const reviewed = !!plan && confirmedRevision === plan.revision;
  const canProceed =
    !!plan &&
    included.length > 0 &&
    reviewed &&
    (!waiting.length || skipRevision === plan.revision);
  return (
    <div className="md-group-shell md-marketing-shell">
      <SiteHeader />
      <main className="md-group-main" id="main-content">
        <div className="md-group-topline">
          <Link to="/menus">
            <ArrowLeft size={18} aria-hidden="true" />
            Back to menus
          </Link>
          <MealDeckLogo className="md-group-logo" decorative />
        </div>
        {issue && (
          <div className="md-group-error" role="alert" ref={issueHeading} tabIndex={-1}>
            <p>{issue}</p>
            {issue.includes("another tab") && (
              <button type="button" onClick={() => window.location.reload()}>
                Reload the saved group
              </button>
            )}
            <button type="button" onClick={() => setIssue("")}>
              Dismiss message
            </button>
          </div>
        )}
        {!stored ? (
          <p role="status">Opening your group planner…</p>
        ) : incoming?.kind === "invite" ? (
          <ParticipantPlanner
            key={incoming.groupId + incoming.inviteId}
            invite={incoming}
            origin={origin}
          />
        ) : (
          <>
            <header className="md-group-heading">
              <span className="md-group-kicker">Luton · Collection &amp; kerbside</span>
              <h1 ref={pageHeading} tabIndex={-1}>
                Everyone chooses.
                <br />
                One person pays.
              </h1>
              <p>
                Bring five menus into one group order. Share an invitation for each person, review
                their reply, then take everyone’s choices to checkout.
              </p>
            </header>
            <ol className="md-group-steps">
              <li>
                <span>1</span>
                <strong>Invite your people</strong>
                <p>Send each person their own link.</p>
              </li>
              <li>
                <span>2</span>
                <strong>Get their picks back</strong>
                <p>They choose food and send you a reply link.</p>
              </li>
              <li>
                <span>3</span>
                <strong>Review &amp; pay once</strong>
                <p>One numbered bag per person. One collection.</p>
              </li>
            </ol>
            <div className="md-group-truth">
              <Users size={22} aria-hidden="true" />
              <p>
                <strong>Your draft lives in this browser.</strong> This is not a live synced room.
                Friends must send their reply links back to you. Split payments are unavailable;
                checkout follows the kitchen’s live availability and opening hours.
              </p>
            </div>
            {stored.error && (
              <div className="md-group-error" role="alert">
                <p>{stored.error}</p>
                <p>Your saved personal menu basket is separate. You can start a new group below.</p>
              </div>
            )}
            {incoming?.kind === "reply" &&
              (plan ? (
                <IncomingReply
                  plan={plan}
                  reply={incoming}
                  onAccept={acceptReply}
                  onDismiss={dismissIncoming}
                />
              ) : (
                <section className="md-group-card">
                  <h2>Open this reply in your original browser.</h2>
                  <p>
                    The organiser’s group draft is not saved here. Use the same browser and device
                    that created the invitations. A reply link cannot recreate the whole group.
                  </p>
                  <button
                    type="button"
                    className="md-group-button md-group-button-light"
                    onClick={dismissIncoming}
                  >
                    Open the group planner
                  </button>
                </section>
              ))}
            {!plan ? (
              <section className="md-group-card md-group-start">
                <h2>Start with your people.</h2>
                <p>
                  Up to 10 people and 60 selections. Choose here or copy your saved basket into your
                  bag. Your personal basket stays saved separately.
                </p>
                <button
                  type="button"
                  className="md-group-button"
                  onClick={(event) => (stored.error ? openReset(event.currentTarget) : start())}
                >
                  Start a group order <ArrowRight size={19} aria-hidden="true" />
                </button>
                <LinkPrivacy />
              </section>
            ) : (
              <>
                <section className="md-group-plan" aria-label="Your group draft">
                  <div className="md-group-section-heading">
                    <div>
                      <span className="md-group-kicker">
                        {plan.people.length} / {MAX_GROUP_PEOPLE} people
                      </span>
                      <h2 ref={groupHeading} tabIndex={-1}>
                        Your group.
                      </h2>
                      <p>
                        {stored.saved
                          ? "Draft saved in this browser. Keep using this device to collect replies."
                          : "For this visit only. Keep this page open—this browser could not save your draft."}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="md-group-button md-group-button-light"
                      onClick={(event) => openReset(event.currentTarget)}
                    >
                      Start a new group
                    </button>
                  </div>
                  <div className="md-group-people">
                    {plan.people.map((person) => {
                      const bag = included.findIndex((entry) => entry.id === person.id) + 1;
                      return (
                        <article className="md-group-person" key={person.id}>
                          <div className="md-group-person-heading">
                            <div>
                              <span className="md-group-bag">
                                {bag ? "Bag " + bag : "Waiting for choices"}
                              </span>
                              <h3>{person.label}</h3>
                              <p>
                                {person.picks.length
                                  ? launchPickCount(person.picks) +
                                    " selections · " +
                                    formatLaunchMenuPrice(
                                      launchMenuBasketDisplayPrice(person.picks).itemsSubtotalPence,
                                    )
                                  : person.id === "organiser"
                                    ? "Add your food, or organise without your own bag."
                                    : "Send an invitation, then import their reply."}
                              </p>
                            </div>
                            {person.id !== "organiser" && (
                              <button
                                type="button"
                                className="md-group-icon-button"
                                onClick={(event) => {
                                  dialogOpener.current = event.currentTarget;
                                  setModalIssue("");
                                  setRemovePerson(person.id);
                                }}
                                aria-label={"Remove " + person.label + " from the group"}
                              >
                                <Trash2 size={18} aria-hidden="true" />
                              </button>
                            )}
                          </div>
                          <div className="md-group-actions">
                            {person.id === "organiser" ? (
                              <button
                                ref={organiserButton}
                                type="button"
                                className="md-group-button md-group-button-light"
                                onClick={() => setChoosing(!choosing)}
                                aria-expanded={choosing}
                              >
                                {choosing
                                  ? "Hide food picker"
                                  : person.picks.length
                                    ? "Edit my food"
                                    : "Choose my food"}
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="md-group-button md-group-button-light"
                                onClick={() =>
                                  setInvitePerson(invitePerson === person.id ? null : person.id)
                                }
                                aria-expanded={invitePerson === person.id}
                              >
                                <Share2 size={17} aria-hidden="true" />
                                {invitePerson === person.id ? "Hide invitation" : "Invitation link"}
                              </button>
                            )}
                          </div>
                          {person.picks.length > 0 && (
                            <details>
                              <summary>
                                Review {person.id === "organiser" ? "my" : "their"} food
                              </summary>
                              <GroupChoices picks={person.picks} />
                            </details>
                          )}
                          {person.id === invitePerson && invitationLink && (
                            <ShareGroupLink
                              key={invitationLink}
                              value={invitationLink}
                              title={"Private invitation for " + person.label}
                              description="Send this invitation to this person only. Ask them to send their reply link back to you when they’ve chosen."
                            />
                          )}
                        </article>
                      );
                    })}
                  </div>
                  <form className="md-group-add-person" onSubmit={addPerson}>
                    <label htmlFor="group-person-name">
                      Invite another person <span>Nickname saved on this browser only</span>
                    </label>
                    <div>
                      <input
                        id="group-person-name"
                        autoComplete="off"
                        value={personName}
                        maxLength={32}
                        onChange={(event) => setPersonName(event.target.value)}
                        placeholder="e.g. Sam"
                        disabled={plan.people.length >= MAX_GROUP_PEOPLE}
                      />
                      <button
                        type="submit"
                        className="md-group-button"
                        disabled={!personName.trim() || plan.people.length >= MAX_GROUP_PEOPLE}
                      >
                        <Plus size={19} aria-hidden="true" />
                        Add person
                      </button>
                    </div>
                    {plan.people.length >= MAX_GROUP_PEOPLE && <p>All 10 places are in use.</p>}
                  </form>
                  {choosing && (
                    <GroupMenuComposer
                      autoFocus
                      picks={plan.people[0]!.picks}
                      onChange={(next) => persist(updateOrganiserPicks(plan, next))}
                      onDone={() => {
                        setChoosing(false);
                        requestAnimationFrame(() =>
                          organiserButton.current?.focus({ preventScroll: true }),
                        );
                      }}
                    />
                  )}
                </section>
                <section className="md-group-card md-group-import">
                  <h2>Got a reply?</h2>
                  <p>
                    Open the returned link on this device, or paste it here. You will review the
                    choices before they change your draft.
                  </p>
                  <form onSubmit={reviewPasted}>
                    <label htmlFor="group-reply-link">Reply link</label>
                    <textarea
                      id="group-reply-link"
                      value={replyInput}
                      onChange={(event) => setReplyInput(event.target.value)}
                      maxLength={MAX_GROUP_LINK_LENGTH}
                      rows={2}
                      placeholder="Paste their full MealDeck reply link"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <button
                      type="submit"
                      className="md-group-button md-group-button-light"
                      disabled={!replyInput.trim()}
                    >
                      Review reply <ArrowRight size={18} aria-hidden="true" />
                    </button>
                  </form>
                </section>
                <section className="md-group-card md-group-checkout">
                  <span className="md-group-kicker">Organiser review</span>
                  <h2>Check the whole order.</h2>
                  <p>
                    {groupPlanCount(plan)} selections from {included.length}{" "}
                    {included.length === 1 ? "person" : "people"}. You will pay for everyone in one
                    checkout.
                  </p>
                  {included.map((person, index) => (
                    <details key={person.id}>
                      <summary>
                        Bag {index + 1} · {person.label} · {launchPickCount(person.picks)}{" "}
                        selections
                      </summary>
                      <GroupChoices picks={person.picks} />
                    </details>
                  ))}
                  <p className="md-group-subtotal">
                    <span>Group menu subtotal</span>
                    <strong>{formatLaunchMenuPrice(groupSubtotal)}</strong>
                  </p>
                  <p>
                    The kitchen receives numbered bags, not your friends’ names. Bag numbers may
                    change when a person is removed or has no choices. Keep this draft for your own
                    name-to-bag reminder.
                  </p>
                  <p>
                    Checkout checks the current menu and shows the final price and eligible offer.
                    Planning a group does not reserve food or a pickup time.
                  </p>
                  {waiting.length > 0 && (
                    <label className="md-group-confirm">
                      <input
                        type="checkbox"
                        checked={skipRevision === plan.revision}
                        onChange={(event) =>
                          setSkipRevision(event.target.checked ? plan.revision : null)
                        }
                      />
                      <span>
                        I’m continuing without {waiting.map((person) => person.label).join(", ")}.
                        Their food is not included.
                      </span>
                    </label>
                  )}
                  <label className="md-group-confirm">
                    <input
                      type="checkbox"
                      checked={reviewed}
                      onChange={(event) =>
                        setConfirmedRevision(event.target.checked ? plan.revision : null)
                      }
                      disabled={!included.length}
                    />
                    <span>
                      I’ve checked everyone’s items, quantities, flavours, extras and bags. I will
                      pay for this order.
                    </span>
                  </label>
                  <button
                    type="button"
                    className="md-group-button"
                    disabled={!canProceed}
                    onClick={proceedToCheckout}
                  >
                    Review group at checkout <ArrowRight size={19} aria-hidden="true" />
                  </button>
                  <p className="md-group-muted">
                    Your personal menu basket will stay saved. Payment and collection are handled by
                    the organiser. No split payments or group rewards are created.
                  </p>
                </section>
                <LinkPrivacy />
              </>
            )}
            <p className="md-group-feedback" role="status">
              {notice}
            </p>
          </>
        )}
        <Dialog
          open={!!removePerson}
          onOpenChange={(open) => {
            if (!open) setRemovePerson(null);
          }}
        >
          <DialogContent className="md-group-dialog" onCloseAutoFocus={closeDialogFocus}>
            <DialogTitle>Remove this person?</DialogTitle>
            <DialogDescription>
              Their choices will be removed from your draft and their old reply will no longer
              import. This does not change an order already submitted at checkout.
            </DialogDescription>
            <div className="md-group-actions">
              <button
                type="button"
                className="md-group-button"
                onClick={() => {
                  if (!plan || !removePerson) return;
                  try {
                    persist(removeGroupPerson(plan, removePerson));
                    if (invitePerson === removePerson) setInvitePerson(null);
                    setRemovePerson(null);
                    setNotice("Person removed. Review the updated bag numbers before checkout.");
                  } catch (problem) {
                    setModalIssue(errorMessage(problem));
                  }
                }}
              >
                Remove person
              </button>
              <button
                type="button"
                className="md-group-button md-group-button-light"
                onClick={() => setRemovePerson(null)}
              >
                Keep person
              </button>
            </div>
            {modalIssue && (
              <p className="md-group-error" role="alert">
                {modalIssue}
              </p>
            )}
          </DialogContent>
        </Dialog>
        <Dialog open={resetOpen} onOpenChange={setResetOpen}>
          <DialogContent className="md-group-dialog" onCloseAutoFocus={closeDialogFocus}>
            <DialogTitle>Start a new group draft?</DialogTitle>
            <DialogDescription>
              This replaces the group saved in this browser. Old invitations and replies will no
              longer match. Your personal menu basket and any order already submitted at checkout
              are unchanged.
            </DialogDescription>
            <div className="md-group-actions">
              <button type="button" className="md-group-button" onClick={start}>
                Start new group
              </button>
              <button
                type="button"
                className="md-group-button md-group-button-light"
                onClick={() => setResetOpen(false)}
              >
                Keep current draft
              </button>
            </div>
            {modalIssue && (
              <p className="md-group-error" role="alert">
                {modalIssue}
              </p>
            )}
          </DialogContent>
        </Dialog>
      </main>
      <SiteFooter />
    </div>
  );
}
