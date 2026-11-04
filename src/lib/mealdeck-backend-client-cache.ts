import {
  parseMealDeckPublicBackend,
  type MealDeckBackendResult,
  type MealDeckPublicBackend,
} from "./mealdeck-runtime-config";

export class MealDeckBackendSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MealDeckBackendSetupError";
  }
}

/**
 * One project-bound client. Refresh failures never fall back to the prior
 * database, and reset invalidates an in-flight bootstrap before it can publish
 * an old client into the next staff session.
 */
export function createMealDeckBackendClientCache<Client>(options: {
  read: () => Promise<MealDeckBackendResult>;
  create: (backend: MealDeckPublicBackend) => Client;
  retire: (client: Client) => void;
}) {
  type Slot = { client: Client; backend: MealDeckPublicBackend; retired: boolean };
  let current: Slot | null = null;
  let revision = 0;
  let pending: { revision: number; prior: Slot | null; promise: Promise<Client> } | null = null;
  function retire(slot: Slot | null) {
    if (slot && !slot.retired) {
      slot.retired = true;
      options.retire(slot.client);
    }
  }
  function reset() {
    revision++;
    retire(current);
    retire(pending?.prior ?? null);
    current = null;
    pending = null;
  }
  function finishPending(completedRevision: number) {
    if (pending?.revision === completedRevision) pending = null;
  }
  function initialise(refresh = false): Promise<Client> {
    if (pending) return pending.promise;
    if (current && !refresh) return Promise.resolve(current.client);
    const activeRevision = revision;
    const prior = current;
    current = null;
    const promise = (async () => {
      try {
        const response = await Promise.resolve().then(options.read);
        if (activeRevision !== revision) {
          throw new MealDeckBackendSetupError(
            "The staff connection changed. Please try signing in again.",
          );
        }
        if (response.status !== "ready") throw new MealDeckBackendSetupError(response.message);
        const backend = parseMealDeckPublicBackend(response.backend);
        if (!backend)
          throw new MealDeckBackendSetupError(
            "MealDeck’s public database connection could not be verified. Ask your administrator to check its settings.",
          );
        if (
          prior &&
          !prior.retired &&
          prior.backend.url === backend.url &&
          prior.backend.publishableKey === backend.publishableKey
        ) {
          current = prior;
          return prior.client;
        }
        retire(prior);
        const client = options.create(backend);
        current = { client, backend, retired: false };
        return client;
      } catch (reason) {
        retire(prior);
        if (activeRevision === revision) current = null;
        throw reason;
      } finally {
        finishPending(activeRevision);
      }
    })();
    pending = { revision: activeRevision, prior, promise };
    return promise;
  }
  return { initialise, reset, get: () => current?.client ?? null };
}
