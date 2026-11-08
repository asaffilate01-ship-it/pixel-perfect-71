import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import {
  Banknote,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Minus,
  Plus,
  RefreshCcw,
  Search,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  LaunchItemCustomiser,
  type LaunchItemDraft,
} from "@/components/menus/launch-item-customiser";
import { usePublicMenu } from "@/components/menus/use-public-menu";
import {
  addLaunchPick,
  findLaunchMenuItem,
  launchPickCount,
  launchSelectionLabels,
  MAX_LAUNCH_PICKS,
  setLaunchPickQuantity,
  updateLaunchPick,
  type LaunchMenuPick,
  type LaunchMenuSelections,
} from "@/lib/launch-menu-picks";
import {
  launchCrossSelectionSummaries,
  type LaunchCrossSelection,
} from "@/lib/launch-menu-upsells";
import {
  formatLaunchMenuPrice,
  launchMenuPickDisplayPrice,
} from "@/lib/launch-menu-display-prices";
import { normalizeCustomerName, normalizeCustomerPhone } from "@/lib/mealdeck-customer";
import {
  MAX_ORDER_NOTES_LENGTH,
  normaliseOrderNotes,
  orderNotesMatch,
} from "@/lib/mealdeck-order-notes";
import {
  CashOrderError,
  requestCashOrder,
  type CashOrder,
  type CashQuote,
} from "@/lib/mealdeck-cash-orders";
import {
  cashAttemptKey,
  clearCashAttempt,
  readCashAttempt,
  saveCashAttempt,
  type CashAttempt,
} from "@/lib/mealdeck-cash-recovery";
import "@/styles.launch-prices.css";
import "./cash-order-panel.css";

const money = (pence: number) => formatLaunchMenuPrice(pence);

function CashQuoteReview({ quote }: { quote: CashQuote }) {
  return (
    <div className="md-cash-review">
      <div className="md-cash-contact">
        <strong>{quote.customerName}</strong>
        <span>{quote.customerPhone}</span>
        <span>Walk-in · Collection · {quote.collectionEstimateMinutes} minute estimate</span>
      </div>
      <ul className="md-cash-quoted-lines" aria-label="Final cash order">
        {quote.lines.map((line) => (
          <li key={line.lineId} data-attached={!!line.parentLineId}>
            <div>
              <strong>
                {line.quantity} × {line.name}
              </strong>
              <strong>{money(line.line_pence)}</strong>
            </div>
            <p>
              {money(line.unit_pence)} each{line.attachment ? ` · ${line.attachment}` : ""}
            </p>
            {!!line.modifiers.length && (
              <p>{line.modifiers.map((option) => option.name).join(" · ")}</p>
            )}
          </li>
        ))}
      </ul>
      {quote.notes && (
        <div className="md-cash-notes">
          <strong>Customer notes</strong>
          <p>{quote.notes}</p>
        </div>
      )}
      <p className="md-cash-muted">
        One bag
        {quote.packingPlan.cutleryRequested ? " · Cutlery requested" : " · No cutlery requested"}
      </p>
      <dl className="md-cash-totals">
        <div>
          <dt>Food and extras</dt>
          <dd>{money(quote.grossPence)}</dd>
        </div>
        {quote.discountPence > 0 && (
          <div>
            <dt>Discount</dt>
            <dd>−{money(quote.discountPence)}</dd>
          </div>
        )}
        <div className="md-cash-total">
          <dt>Cash to collect</dt>
          <dd>{money(quote.totalPence)}</dd>
        </div>
      </dl>
    </div>
  );
}

export function CashOrderPanel({
  tenantId,
  locationId,
  staffUserId,
  onRecorded,
}: {
  tenantId: string;
  locationId: string;
  staffUserId: string;
  onRecorded: (order: CashOrder) => void;
}) {
  const scope = useMemo(() => ({ tenantId, locationId }), [tenantId, locationId]);
  const storageKey = useMemo(() => cashAttemptKey(scope, staffUserId), [scope, staffUserId]);
  const id = useId();
  const menu = usePublicMenu();
  const [expanded, setExpanded] = useState(false);
  const [booted, setBooted] = useState(false);
  const [storageIssue, setStorageIssue] = useState("");
  const [picks, setPicks] = useState<LaunchMenuPick[]>([]);
  const [draft, setDraft] = useState<LaunchItemDraft | null>(null);
  const [draftError, setDraftError] = useState("");
  const [brandId, setBrandId] = useState("");
  const [search, setSearch] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [cutlery, setCutlery] = useState(false);
  const [quote, setQuote] = useState<CashQuote | null>(null);
  const [cashReceived, setCashReceived] = useState(false);
  const [pending, setPending] = useState<CashAttempt | null>(null);
  const [result, setResult] = useState<CashOrder | null>(null);
  const [issue, setIssue] = useState("");
  const [busy, setBusy] = useState(false);
  const [recoveryChecked, setRecoveryChecked] = useState(false);
  const alive = useRef(false);
  const busyRef = useRef(false);
  const serial = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const recorded = useRef(onRecorded);
  const successHeading = useRef<HTMLHeadingElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const issueMessage = useRef<HTMLParagraphElement>(null);
  const storageIssueMessage = useRef<HTMLParagraphElement>(null);
  const customiserTrigger = useRef<HTMLButtonElement | null>(null);
  const menuHeading = useRef<HTMLHeadingElement>(null);
  recorded.current = onRecorded;
  const brand = menu.catalogue.find((entry) => entry.id === brandId) ?? menu.catalogue[0];
  const count = launchPickCount(picks);

  const finish = useCallback(
    (order: CashOrder, attempt: CashAttempt) => {
      if (order.quoteId !== attempt.quoteId)
        throw new CashOrderError(
          "binding_changed",
          "The returned order does not match this saved attempt. Keep it saved and ask your administrator to check it.",
          502,
          true,
        );
      setResult(order);
      clearCashAttempt(window.sessionStorage, storageKey, attempt);
      setPending(null);
      setQuote(null);
      setCashReceived(false);
      setIssue("");
      recorded.current(order);
    },
    [storageKey],
  );

  const finishUnused = useCallback(
    (attempt: CashAttempt) => {
      clearCashAttempt(window.sessionStorage, storageKey, attempt);
      setPending(null);
      setQuote(null);
      setCashReceived(false);
      setRecoveryChecked(false);
      setIssue(
        "The unused attempt is closed. Check the cash in hand and review a fresh total before recording this order.",
      );
    },
    [storageKey],
  );

  const begin = () => {
    if (busyRef.current) return null;
    busyRef.current = true;
    setBusy(true);
    setIssue("");
    controller.current = new AbortController();
    return { sequence: ++serial.current, signal: controller.current.signal };
  };
  const current = (sequence: number) => alive.current && serial.current === sequence;
  const end = (sequence: number) => {
    if (current(sequence)) {
      busyRef.current = false;
      setBusy(false);
    }
  };

  useEffect(() => {
    alive.current = true;
    const abort = new AbortController();
    let live = true;
    async function restore() {
      try {
        const attempt = readCashAttempt(window.sessionStorage, storageKey);
        if (!attempt) {
          setBooted(true);
          return;
        }
        setExpanded(true);
        setPending(attempt);
        setBusy(true);
        busyRef.current = true;
        setBooted(true);
        try {
          const response = await requestCashOrder(
            scope,
            { action: "status", quoteId: attempt.quoteId, attemptId: attempt.attemptId },
            abort.signal,
          );
          if (!live) return;
          if (response.order) finish(response.order, attempt);
          else if (response.cancelled === true) finishUnused(attempt);
          else setRecoveryChecked(true);
        } catch (error) {
          if (live)
            setIssue(
              error instanceof Error
                ? error.message
                : "Check the saved cash order before continuing.",
            );
        } finally {
          if (live) {
            setBusy(false);
            busyRef.current = false;
          }
        }
      } catch (error) {
        if (live) {
          setExpanded(true);
          setStorageIssue(
            error instanceof Error ? error.message : "Cash-order recovery is unavailable.",
          );
          setBooted(true);
        }
      }
    }
    void restore();
    return () => {
      live = false;
      alive.current = false;
      abort.abort();
      controller.current?.abort();
      serial.current += 1;
    };
  }, [storageKey, scope, finish, finishUnused]);

  useEffect(() => {
    if (result) successHeading.current?.focus();
    else if (quote) reviewHeading.current?.focus();
  }, [result, quote]);

  useEffect(() => {
    if (!expanded) return;
    const message = issue
      ? issueMessage.current
      : storageIssue
        ? storageIssueMessage.current
        : null;
    if (!message) return;
    message.focus({ preventScroll: true });
    message.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [expanded, issue, storageIssue]);

  function savePick(
    selections: LaunchMenuSelections,
    quantity: number,
    cross: LaunchCrossSelection[],
  ) {
    if (!draft || !menu.ready) return;
    const next = draft.existing
      ? updateLaunchPick(picks, draft.existing.key, selections, quantity, cross)
      : addLaunchPick(picks, draft.brand.id, draft.item.id, selections, quantity, cross);
    if (next === picks) {
      setDraftError("Check the choices and quantity. An order can contain up to 60 items.");
      return;
    }
    setPicks(next);
    setDraft(null);
    setDraftError("");
    setIssue("");
  }

  async function review(event: FormEvent) {
    event.preventDefault();
    if (!menu.ready || !picks.length || pending || storageIssue || !booted) return;
    const name = normalizeCustomerName(customerName);
    const phone = normalizeCustomerPhone(customerPhone);
    if (!name || !phone) {
      setIssue("Enter the customer’s name and a valid phone number before reviewing the order.");
      return;
    }
    let savedNotes: string | null;
    try {
      savedNotes = normaliseOrderNotes(notes);
    } catch (error) {
      setIssue((error as Error).message);
      return;
    }
    const request = begin();
    if (!request) return;
    try {
      const response = await requestCashOrder(
        scope,
        {
          action: "quote",
          fulfilment: "pickup",
          customerName: name,
          customerPhone: phone,
          ...(savedNotes ? { notes: savedNotes } : {}),
          picks: picks.map(
            ({ brandId: pickedBrand, itemId, quantity, selections, crossSelections }) => ({
              brandId: pickedBrand,
              itemId,
              quantity,
              selections,
              ...(crossSelections?.length ? { crossSelections } : {}),
            }),
          ),
          packing: { separateBags: false, cutleryRequested: cutlery, bagCount: 1, allocations: [] },
        },
        request.signal,
      );
      if (!current(request.sequence)) return;
      if (
        !response.quote ||
        response.quote.customerName !== name ||
        response.quote.customerPhone !== phone ||
        !orderNotesMatch(savedNotes, response.quote.notes) ||
        response.quote.packingPlan.cutleryRequested !== cutlery
      )
        throw new Error("The customer details could not be confirmed. Review them and try again.");
      setQuote(response.quote);
      setCashReceived(false);
    } catch (error) {
      if (current(request.sequence))
        setIssue(
          error instanceof Error ? error.message : "The current total could not be checked.",
        );
    } finally {
      end(request.sequence);
    }
  }

  async function confirm(saved?: CashAttempt) {
    if (!saved && (!quote || !cashReceived || pending || storageIssue || !booted)) return;
    if (!saved && quote && Date.parse(quote.expiresAt) <= Date.now()) {
      setQuote(null);
      setCashReceived(false);
      setIssue("The reviewed total expired. Check the current total before collecting cash.");
      return;
    }
    const request = begin();
    if (!request) return;
    const attempt = saved ?? {
      version: 1 as const,
      quoteId: quote!.quoteId,
      attemptId: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    let submitted = false;
    try {
      saveCashAttempt(window.sessionStorage, storageKey, attempt);
      setPending(attempt);
      submitted = true;
      const response = await requestCashOrder(
        scope,
        {
          action: "confirm",
          quoteId: attempt.quoteId,
          attemptId: attempt.attemptId,
          cashReceived: true,
        },
        request.signal,
      );
      if (!current(request.sequence)) return;
      if (!response.order)
        throw new CashOrderError(
          "unknown",
          "The cash result is not confirmed. Check this saved attempt.",
          502,
          true,
        );
      finish(response.order, attempt);
    } catch (error) {
      if (!current(request.sequence)) return;
      if (!submitted) {
        setStorageIssue(
          error instanceof Error ? error.message : "Cash-order recovery could not be saved.",
        );
        try {
          const stored = readCashAttempt(window.sessionStorage, storageKey);
          if (stored) setPending(stored);
        } catch {
          /* Keep the storage error visible; no confirmation was submitted. */
        }
      }
      // Only a definite rejection of this first request allows another quote.
      // A later recovery error never proves that an earlier request did not commit.
      if (!saved && error instanceof CashOrderError && !error.outcomeUnknown) {
        try {
          clearCashAttempt(window.sessionStorage, storageKey, attempt);
          setPending(null);
          setQuote(null);
          setCashReceived(false);
        } catch (storageError) {
          setStorageIssue((storageError as Error).message);
        }
      }
      setIssue(
        error instanceof Error
          ? error.message
          : "The cash result is unknown. Check the saved attempt.",
      );
    } finally {
      end(request.sequence);
    }
  }

  async function checkPending() {
    if (!pending) return;
    const request = begin();
    if (!request) return;
    try {
      const response = await requestCashOrder(
        scope,
        { action: "status", quoteId: pending.quoteId, attemptId: pending.attemptId },
        request.signal,
      );
      if (!current(request.sequence)) return;
      if (response.order) finish(response.order, pending);
      else if (response.cancelled === true) finishUnused(pending);
      else {
        setRecoveryChecked(true);
        setIssue(
          "No cash order is recorded for this attempt yet. Retry this same confirmation once the cash has been received.",
        );
      }
    } catch (error) {
      if (current(request.sequence))
        setIssue(
          error instanceof Error ? error.message : "The saved cash order could not be checked.",
        );
    } finally {
      end(request.sequence);
    }
  }

  async function closeUnusedAttempt() {
    if (!pending || !recoveryChecked) return;
    const request = begin();
    if (!request) return;
    try {
      const response = await requestCashOrder(
        scope,
        {
          action: "cancel",
          quoteId: pending.quoteId,
          attemptId: pending.attemptId,
        },
        request.signal,
      );
      if (!current(request.sequence)) return;
      // The server serialises this with confirmation: a committed order wins;
      // otherwise a permanent quote closure prevents any late creation.
      if (response.order) finish(response.order, pending);
      else if (response.cancelled === true) finishUnused(pending);
      else throw new Error("This attempt could not be closed. Keep it saved and check again.");
    } catch (error) {
      if (current(request.sequence))
        setIssue(
          error instanceof Error
            ? error.message
            : "The saved attempt could not be closed. Check it again.",
        );
    } finally {
      end(request.sequence);
    }
  }

  function startNext() {
    if (pending || busy) return;
    setResult(null);
    setPicks([]);
    setCustomerName("");
    setCustomerPhone("");
    setNotes("");
    setCutlery(false);
    setCashReceived(false);
    setIssue("");
    setRecoveryChecked(false);
    setSearch("");
  }

  return (
    <section className="md-ops-card md-cash" aria-labelledby={id + "-title"}>
      <div className="md-cash-heading">
        <div>
          <h2 id={id + "-title"}>
            <Banknote aria-hidden="true" size={23} /> Cash walk-in order
          </h2>
          <p className="md-cash-muted">Add food for a customer paying cash at the counter.</p>
        </div>
        <button
          type="button"
          className="md-ops-button md-ops-secondary"
          aria-expanded={expanded}
          aria-controls={id + "-body"}
          disabled={!booted || busy}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronUp size={18} /> : <Plus size={18} />}
          {expanded ? "Hide" : pending ? "Check cash order" : "New cash order"}
        </button>
      </div>
      {expanded && (
        <div id={id + "-body"} className="md-cash-body" aria-busy={busy}>
          {storageIssue && (
            <p role="alert" className="md-cash-issue" tabIndex={-1} ref={storageIssueMessage}>
              {storageIssue}
            </p>
          )}
          {issue && (
            <p role="alert" className="md-cash-issue" tabIndex={-1} ref={issueMessage}>
              {issue}
            </p>
          )}
          {result ? (
            <div className="md-cash-success">
              <CheckCircle2 size={32} aria-hidden="true" />
              <h3 tabIndex={-1} ref={successHeading}>
                Cash order {result.orderNumber}
              </h3>
              <p>
                <strong>{result.customerName}</strong> · {result.customerPhone}
              </p>
              <p>
                {money(result.totalPence)} cash recorded · Collection code{" "}
                <strong>{result.handoffCode}</strong>
              </p>
              <p>
                {result.verifiedPaid && result.paymentStatus === "paid"
                  ? result.acceptedAt
                    ? "The order has been accepted. Check its progress on KDS."
                    : "Sent to KDS for acceptance. Accept it on KDS or the printer to queue its receipt."
                  : "This saved order’s payment status has changed. Review it in order history before taking further payment."}
              </p>
              <button
                type="button"
                disabled={!!pending || busy}
                onClick={startNext}
                className="md-ops-button md-ops-primary"
              >
                <Plus size={18} /> Another cash order
              </button>
            </div>
          ) : pending ? (
            <div className="md-cash-recovery">
              <h3>Check the saved cash order</h3>
              <p>
                {busy
                  ? "Checking the original confirmation…"
                  : "Keep this attempt while its result is checked. A retry uses the same order and will not record another cash payment."}
              </p>
              {recoveryChecked && (
                <p className="md-cash-muted">
                  The latest check found no recorded order for this attempt.
                </p>
              )}
              <div className="md-cash-actions">
                {recoveryChecked && (
                  <button
                    type="button"
                    className="md-ops-button md-ops-secondary"
                    disabled={busy || !!storageIssue}
                    onClick={() => void closeUnusedAttempt()}
                  >
                    Close unused attempt
                  </button>
                )}
                <button
                  type="button"
                  className="md-ops-button md-ops-secondary"
                  disabled={busy}
                  onClick={() => void checkPending()}
                >
                  <RefreshCcw size={18} /> Check original attempt
                </button>
                <button
                  type="button"
                  className="md-ops-button md-ops-primary"
                  disabled={busy || !!storageIssue}
                  onClick={() => void confirm(pending)}
                >
                  Retry same cash confirmation
                </button>
              </div>
            </div>
          ) : quote ? (
            <div className="md-cash-confirm">
              <h3 tabIndex={-1} ref={reviewHeading}>
                Review and collect cash
              </h3>
              <CashQuoteReview quote={quote} />
              <label className="md-cash-check">
                <input
                  type="checkbox"
                  checked={cashReceived}
                  disabled={busy}
                  onChange={(event) => setCashReceived(event.target.checked)}
                />
                <span>
                  I have received <strong>{money(quote.totalPence)}</strong> in cash for this order.
                </span>
              </label>
              <div className="md-cash-actions">
                <button
                  type="button"
                  className="md-ops-button md-ops-secondary"
                  disabled={busy}
                  onClick={() => {
                    setQuote(null);
                    setCashReceived(false);
                    setIssue("");
                  }}
                >
                  Edit order
                </button>
                <button
                  type="button"
                  className="md-ops-button md-ops-primary"
                  disabled={busy || !cashReceived || !!storageIssue}
                  onClick={() => void confirm()}
                >
                  <Banknote size={19} />
                  {busy ? "Recording cash…" : "Record cash & send to kitchen"}
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={(event) => void review(event)} className="md-cash-layout">
              <div className="md-cash-menu">
                <h3 ref={menuHeading} tabIndex={-1}>
                  Choose food
                </h3>
                <div className="md-cash-brands" aria-label="Menu brand">
                  {menu.catalogue.map((entry) => (
                    <button
                      type="button"
                      key={entry.id}
                      aria-pressed={brand?.id === entry.id}
                      onClick={() => setBrandId(entry.id)}
                    >
                      {entry.name}
                    </button>
                  ))}
                </div>
                <label className="md-cash-search">
                  <Search size={18} aria-hidden="true" />
                  <span className="sr-only">Find an item</span>
                  <input
                    className="md-ops-field"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Find an item"
                    type="search"
                  />
                </label>
                {!menu.ready && (
                  <div className="md-cash-issue" role="status">
                    <p>
                      {menu.loading
                        ? "Checking current menu…"
                        : "The current menu could not be checked. Your cash order is kept on this screen."}
                    </p>
                    <button
                      type="button"
                      className="md-ops-button md-ops-secondary"
                      onClick={menu.retry}
                    >
                      Retry menu
                    </button>
                  </div>
                )}
                <div className="md-cash-menu-scroll">
                  {brand?.sections.map((section) => {
                    const items = section.items.filter(
                      (item) =>
                        !search.trim() ||
                        `${item.name} ${section.title}`
                          .toLocaleLowerCase()
                          .includes(search.trim().toLocaleLowerCase()),
                    );
                    if (!items.length) return null;
                    return (
                      <section key={section.id}>
                        <h4>{section.title}</h4>
                        <div className="md-cash-menu-items">
                          {items.map((item) => (
                            <button
                              type="button"
                              key={item.id}
                              disabled={
                                !menu.ready ||
                                busy ||
                                item.available === false ||
                                count >= MAX_LAUNCH_PICKS ||
                                !!storageIssue
                              }
                              onClick={(event) => {
                                customiserTrigger.current = event.currentTarget;
                                setDraft({ brand, section, item });
                                setDraftError("");
                              }}
                            >
                              <strong>{item.name}</strong>
                              <span>
                                {item.available === false
                                  ? "Out of stock"
                                  : `${item.priceVariants?.length ? "From " : ""}${formatLaunchMenuPrice(item.pricePence)}`}
                              </span>
                              <Plus size={18} aria-hidden="true" />
                            </button>
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
              </div>
              <div className="md-cash-basket">
                <h3>
                  <ShoppingBag size={19} aria-hidden="true" /> Order · {count}{" "}
                  {count === 1 ? "item" : "items"}
                </h3>
                {!picks.length ? (
                  <p className="md-cash-empty">Add the customer’s food from the menu.</p>
                ) : (
                  <ul className="md-cash-draft-lines">
                    {picks.map((pick) => {
                      const found = findLaunchMenuItem(pick.brandId, pick.itemId, menu.catalogue);
                      if (!found)
                        return (
                          <li key={pick.key}>
                            <p>This item is no longer on the menu.</p>
                            <button
                              type="button"
                              className="md-ops-button md-ops-secondary"
                              onClick={() => setPicks(setLaunchPickQuantity(picks, pick.key, 0))}
                            >
                              Remove item
                            </button>
                          </li>
                        );
                      const price = launchMenuPickDisplayPrice(pick, menu.catalogue);
                      const choices = launchSelectionLabels(
                        found.brand,
                        found.item,
                        pick.selections,
                        pick.crossSelections ?? [],
                      );
                      const extras = launchCrossSelectionSummaries(
                        found.brand,
                        found.item,
                        pick.selections,
                        pick.crossSelections ?? [],
                        menu.catalogue,
                      );
                      return (
                        <li key={pick.key}>
                          <div className="md-cash-line-title">
                            <strong>{found.item.name}</strong>
                            <span>{formatLaunchMenuPrice(price.itemsSubtotalPence)}</span>
                          </div>
                          <p>
                            {found.brand.name}
                            {choices.length ? " · " + choices.join(" · ") : ""}
                          </p>
                          {extras.map((extra, index) => (
                            <p key={index}>{extra.label}</p>
                          ))}
                          <div className="md-cash-line-actions">
                            <div
                              className="md-cash-quantity"
                              role="group"
                              aria-label={"Quantity for " + found.item.name}
                            >
                              <button
                                type="button"
                                aria-label={"Decrease " + found.item.name}
                                disabled={busy || pick.quantity <= 1}
                                onClick={() =>
                                  setPicks(
                                    setLaunchPickQuantity(picks, pick.key, pick.quantity - 1),
                                  )
                                }
                              >
                                <Minus size={17} />
                              </button>
                              <span>{pick.quantity}</span>
                              <button
                                type="button"
                                aria-label={"Increase " + found.item.name}
                                disabled={busy || pick.quantity >= 20 || count >= MAX_LAUNCH_PICKS}
                                onClick={() =>
                                  setPicks(
                                    setLaunchPickQuantity(picks, pick.key, pick.quantity + 1),
                                  )
                                }
                              >
                                <Plus size={17} />
                              </button>
                            </div>
                            <button
                              type="button"
                              className="md-ops-button md-ops-secondary"
                              disabled={busy || !menu.ready}
                              onClick={(event) => {
                                customiserTrigger.current = event.currentTarget;
                                setDraft({ ...found, existing: pick });
                                setDraftError("");
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="md-ops-button md-ops-secondary"
                              aria-label={"Remove " + found.item.name}
                              disabled={busy}
                              onClick={() => setPicks(setLaunchPickQuantity(picks, pick.key, 0))}
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="md-cash-fields">
                  <label htmlFor={id + "-name"}>
                    Customer name <span>(required)</span>
                    <input
                      id={id + "-name"}
                      className="md-ops-field"
                      required
                      maxLength={120}
                      autoComplete="off"
                      value={customerName}
                      disabled={busy}
                      onChange={(event) => setCustomerName(event.target.value)}
                    />
                  </label>
                  <label htmlFor={id + "-phone"}>
                    Phone number <span>(required)</span>
                    <input
                      id={id + "-phone"}
                      className="md-ops-field"
                      required
                      type="tel"
                      inputMode="tel"
                      autoComplete="off"
                      maxLength={40}
                      placeholder="07… or +44…"
                      value={customerPhone}
                      disabled={busy}
                      onChange={(event) => setCustomerPhone(event.target.value)}
                    />
                  </label>
                  <label htmlFor={id + "-notes"}>
                    Customer notes <span>(optional)</span>
                    <textarea
                      id={id + "-notes"}
                      className="md-ops-field"
                      rows={3}
                      maxLength={MAX_ORDER_NOTES_LENGTH * 2}
                      value={notes}
                      disabled={busy}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="For example, no onions. Add priced extras using the menu."
                    />
                    <small>
                      {[...notes].length}/{MAX_ORDER_NOTES_LENGTH} characters
                    </small>
                  </label>
                  <label className="md-cash-check">
                    <input
                      type="checkbox"
                      checked={cutlery}
                      disabled={busy}
                      onChange={(event) => setCutlery(event.target.checked)}
                    />{" "}
                    Include cutlery
                  </label>
                </div>
                <p className="md-cash-muted">
                  Collection · One bag. Current prices, stock and any applicable discount are
                  checked before cash is recorded.
                </p>
                <button
                  type="submit"
                  className="md-ops-button md-ops-primary md-cash-review-button"
                  disabled={busy || !picks.length || !menu.ready || !!storageIssue || !booted}
                >
                  {busy ? "Checking total…" : "Review cash total"}
                  <ChevronDown size={18} />
                </button>
              </div>
            </form>
          )}
        </div>
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
            const trigger = customiserTrigger.current;
            const target =
              trigger?.isConnected && !trigger.disabled && trigger.getClientRects().length
                ? trigger
                : menuHeading.current;
            target?.focus({ preventScroll: true });
          }}
        >
          {draft && (
            <LaunchItemCustomiser
              key={draft.item.id + (draft.existing?.key ?? "new")}
              draft={draft}
              basketPicks={picks}
              onSave={savePick}
              onBack={() => setDraft(null)}
              error={draftError}
              context="staff-order"
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
