import type { PaymentIntent } from "@stripe/stripe-terminal-react-native";
import type { AttemptResponse, Recovery, TerminalOrder, TerminalQuote } from "../api/types";

export type PaymentPhase =
  | "empty"
  | "loading"
  | "review"
  | "preparing"
  | "collecting"
  | "confirming"
  | "checking"
  | "pending"
  | "retryable"
  | "paid"
  | "hold"
  | "cancelled"
  | "error";
export type PaymentView = {
  phase: PaymentPhase;
  order: TerminalOrder | null;
  quote: TerminalQuote | null;
  message: string;
  recovery: Recovery | null;
};
type SdkResult = {
  paymentIntent?: PaymentIntent.Type;
  error?: { code?: string; message?: string };
};
export interface PaymentDependencies {
  api: {
    lookup(reference: string): Promise<TerminalOrder>;
    prepare(value: Recovery): Promise<AttemptResponse>;
    reconcile(value: Recovery): Promise<AttemptResponse>;
    cancel(value: Recovery): Promise<AttemptResponse>;
  };
  sdk: {
    retrieve(secret: string): Promise<SdkResult>;
    collect(intent: PaymentIntent.Type): Promise<SdkResult>;
    confirm(intent: PaymentIntent.Type): Promise<SdkResult>;
    cancelCollection(): Promise<{ error?: { message?: string } }>;
  };
  journal: {
    read(): Promise<Recovery | null>;
    write(value: Recovery): Promise<void>;
    clear(): Promise<void>;
  };
  online(): Promise<boolean>;
  canCollect(): boolean;
  liveMode(): boolean;
  uuid(): string;
}

const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The payment could not be checked. Reconnect and check the same order.";
const unavailable =
  "Reconnect to the internet before taking payment. Offline payments are unavailable; check any existing attempt first.";

/** One in-flight operation and one durable recovery ID. SDK success is never payment evidence. */
export class PaymentController {
  private view: PaymentView = {
    phase: "empty",
    order: null,
    quote: null,
    message: "Start a sale or find the original MealDeck order to take payment.",
    recovery: null,
  };
  private readonly listeners = new Set<() => void>();
  private busy = false;
  private cancellationRequested = false;
  private restoreComplete = false;
  constructor(private readonly dependencies: PaymentDependencies) {}
  getSnapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(update: Partial<PaymentView>) {
    this.view = { ...this.view, ...update };
    this.listeners.forEach((listener) => listener());
  }
  private async run(work: () => Promise<void>) {
    if (this.busy) return;
    this.busy = true;
    try {
      await work();
    } catch (error) {
      this.update({ phase: this.view.recovery ? "pending" : "error", message: message(error) });
    } finally {
      this.busy = false;
    }
  }
  private async requireOnline() {
    if (!(await this.dependencies.online())) throw new Error(unavailable);
  }

  async restore() {
    return this.run(async () => {
      // A failed secure-storage read blocks new payments; it is not an empty journal.
      const recovery = await this.dependencies.journal.read();
      this.restoreComplete = true;
      this.update({ recovery });
      if (recovery) await this.checkExisting();
    });
  }

  async lookup(reference: string) {
    return this.run(async () => {
      if (!this.restoreComplete)
        throw new Error(
          "Restore the device's existing payment record before starting another payment.",
        );
      if (this.view.recovery)
        throw new Error("Check or cancel the existing payment before opening another order.");
      if (!reference.trim())
        throw new Error("Enter an order reference or four-digit handoff code.");
      await this.requireOnline();
      this.update({ phase: "loading", message: "Loading the current order…" });
      const order = await this.dependencies.api.lookup(reference);
      this.update({
        order,
        quote: null,
        phase: order.status === "paid" ? "paid" : order.status === "hold" ? "hold" : "review",
        message: order.message,
      });
    });
  }

  reviewQuote(quote: TerminalQuote) {
    if (this.busy || this.view.recovery || !this.restoreComplete)
      throw new Error("Check the current payment before starting another sale.");
    this.update({
      order: null,
      quote,
      phase: "review",
      message: "Review the kitchen's current items, packing and total before taking payment.",
    });
  }

  private async bindOrder(result: AttemptResponse) {
    const recovery = this.view.recovery;
    if (
      !recovery ||
      result.attempt.id !== recovery.attemptId ||
      ("orderId" in recovery && result.order.orderId !== recovery.orderId)
    )
      throw new Error(
        "The server returned a different payment. Keep this attempt and ask a manager to check it.",
      );
    if ("quoteId" in recovery) {
      const resolved = { orderId: result.order.orderId, attemptId: recovery.attemptId };
      await this.dependencies.journal.write(resolved);
      this.update({ recovery: resolved });
    }
  }

  private async apply(result: AttemptResponse) {
    await this.bindOrder(result);
    this.update({ quote: null });
    if (result.order.status === "hold" || result.attempt.status === "hold") {
      this.update({
        order: result.order,
        phase: "hold",
        message:
          result.order.message ||
          "This payment needs a manager check. Keep the original recovery reference and do not collect again.",
      });
      return;
    }
    if (
      result.order.status === "paid" ||
      result.attempt.status === "succeeded" ||
      result.attempt.status === "cancelled"
    ) {
      // Clear only after authoritative reconciliation; a failed clear keeps recovery required.
      await this.dependencies.journal.clear();
      this.update({
        order: result.order,
        recovery: null,
        phase:
          result.order.status === "paid"
            ? "paid"
            : result.attempt.status === "cancelled"
              ? "cancelled"
              : "review",
        message: result.order.message,
      });
    } else {
      this.update({
        order: result.order,
        phase: result.action === "collect" ? "retryable" : "pending",
        message:
          result.order.message ||
          (result.action === "collect"
            ? "The same payment is ready to try again."
            : "Checking payment. Do not ask the customer to pay again yet."),
      });
    }
  }

  private async checkExisting() {
    const recovery = this.view.recovery;
    if (!recovery) return;
    await this.requireOnline();
    this.update({ phase: "checking", message: "Checking the existing payment with MealDeck…" });
    await this.apply(await this.dependencies.api.reconcile(recovery));
  }

  async reconcile() {
    return this.run(() => this.checkExisting());
  }

  /** Explicit recovery of a request the backend did not receive; never a second attempt UUID. */
  async retryPreparation() {
    return this.run(async () => {
      if (!this.view.recovery) return;
      await this.requireOnline();
      this.update({
        phase: "preparing",
        message: "Recovering the original request. Review its amount before taking payment.",
      });
      await this.apply(await this.dependencies.api.prepare(this.view.recovery));
    });
  }

  async collect() {
    return this.run(async () => {
      if (!this.restoreComplete)
        throw new Error("Restore the device's existing payment record first.");
      const reviewed = this.view.order;
      const quote = this.view.quote;
      if (
        (!reviewed && !quote) ||
        (reviewed && (!reviewed.canCollect || reviewed.remainingPence <= 0)) ||
        !["review", "retryable"].includes(this.view.phase)
      )
        throw new Error("Review the current unpaid balance before taking payment.");
      if (quote && Date.parse(quote.expiresAt) <= Date.now())
        throw new Error("This quote expired. Review a fresh kitchen total before collecting.");
      if (!this.dependencies.canCollect())
        throw new Error(
          "Connect an approved Tap to Pay reader and check staff payment readiness first.",
        );
      await this.requireOnline();
      const amount = reviewed?.remainingPence ?? quote!.totalPence;
      const total = reviewed?.totalPence ?? quote!.totalPence;
      const recovery =
        this.view.recovery ??
        (reviewed
          ? { orderId: reviewed.orderId, attemptId: this.dependencies.uuid() }
          : { quoteId: quote!.quoteId, attemptId: this.dependencies.uuid() });
      // Persist BEFORE the first server request, so a timeout/restart reuses the same ID.
      await this.dependencies.journal.write(recovery);
      this.cancellationRequested = false;
      this.update({
        recovery,
        phase: "preparing",
        message: "Checking the current balance and reserving this payment…",
      });
      const prepared = await this.dependencies.api.prepare(recovery);
      await this.bindOrder(prepared);
      if (prepared.action !== "collect") {
        await this.apply(prepared);
        return;
      }
      this.update({ order: prepared.order, quote: null });
      if (prepared.order.remainingPence !== amount || prepared.order.totalPence !== total) {
        this.update({
          phase: "review",
          message:
            "The amount changed. Review the updated order and confirm the current balance before collecting.",
        });
        return;
      }
      if (!prepared.attempt.clientSecret || !prepared.attempt.paymentIntentId)
        throw new Error("This payment is not ready for card collection. Check the same attempt.");
      await this.requireOnline();
      const retrieved = await this.dependencies.sdk.retrieve(prepared.attempt.clientSecret);
      const intent = retrieved.paymentIntent;
      if (retrieved.error || !intent) {
        await this.checkExisting();
        return;
      }
      if (
        intent.id !== prepared.attempt.paymentIntentId ||
        intent.amount !== prepared.order.remainingPence ||
        intent.currency?.toLowerCase() !== "gbp" ||
        intent.livemode !== this.dependencies.liveMode()
      )
        throw new Error(
          "The reader amount or payment mode does not match the reviewed order. Ask a manager to check this attempt.",
        );
      if (intent.status !== "requiresPaymentMethod") {
        await this.checkExisting();
        return;
      }
      this.update({
        phase: "collecting",
        message:
          "Ask the customer to tap their contactless card or wallet and follow the secure reader instructions.",
      });
      const collected = await this.dependencies.sdk.collect(intent);
      if (this.cancellationRequested) {
        this.update({ phase: "checking", message: "Checking cancellation with MealDeck…" });
        await this.apply(await this.dependencies.api.cancel(this.view.recovery!));
        return;
      }
      if (collected.error || !collected.paymentIntent) {
        await this.checkExisting();
        return;
      }
      await this.requireOnline();
      this.update({
        phase: "confirming",
        message: "Confirming the card payment. Keep this screen open.",
      });
      // Even success only means the SDK returned. The backend decides paid/KDS state.
      await this.dependencies.sdk.confirm(collected.paymentIntent);
      await this.checkExisting();
    });
  }

  async cancel() {
    if (this.busy) {
      if (this.view.phase !== "collecting") return;
      this.cancellationRequested = true;
      this.update({ message: "Stopping card collection. Wait while the same payment is checked." });
      try {
        const result = await this.dependencies.sdk.cancelCollection();
        if (result.error)
          this.update({
            message:
              "Cancellation is not confirmed. Wait for the reader and check the same payment.",
          });
      } catch {
        this.update({
          message:
            "Cancellation is not confirmed. Keep this order open until its payment is checked.",
        });
      }
      return;
    }
    return this.run(async () => {
      const recovery = this.view.recovery;
      if (!recovery) return;
      await this.requireOnline();
      this.update({ phase: "checking", message: "Checking cancellation with MealDeck…" });
      await this.apply(await this.dependencies.api.cancel(recovery));
    });
  }
}
