import { describe, expect, test } from "bun:test";
import { createMealDeckBackendClientCache } from "../src/lib/mealdeck-backend-client-cache";
import type {
  MealDeckBackendResult,
  MealDeckPublicBackend,
} from "../src/lib/mealdeck-runtime-config";

const first: MealDeckPublicBackend = {
  schemaVersion: 1,
  owner: "mealdeck",
  url: "https://mealdeckfirstexample.supabase.co",
  publishableKey: "sb_publishable_first_project_test_key",
};
const second: MealDeckPublicBackend = {
  ...first,
  url: "https://mealdecknextxexample.supabase.co",
  publishableKey: "sb_publishable_second_project_test_key",
};
const ready = (backend: MealDeckPublicBackend): MealDeckBackendResult => ({
  status: "ready",
  backend,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function setup(read: () => Promise<MealDeckBackendResult>) {
  type Client = { backend: MealDeckPublicBackend; serial: number };
  const created: Client[] = [];
  const retired: Client[] = [];
  const cache = createMealDeckBackendClientCache({
    read,
    create: (backend) => {
      const client = { backend, serial: created.length + 1 };
      created.push(client);
      return client;
    },
    retire: (client) => {
      retired.push(client);
    },
  });
  return { cache, created, retired };
}

describe("MealDeck staff connection lifecycle", () => {
  test("coalesces concurrent startup and reuses the validated current client", async () => {
    const response = deferred<MealDeckBackendResult>();
    let reads = 0;
    const { cache, created } = setup(() => {
      reads++;
      return response.promise;
    });
    const left = cache.initialise();
    const right = cache.initialise();
    expect(cache.get()).toBeNull();
    response.resolve(ready(first));
    expect(await left).toBe(await right);
    expect(await cache.initialise()).toBe(await left);
    expect(reads).toBe(1);
    expect(created).toHaveLength(1);
  });

  test("matching server refresh preserves the same staff client and session", async () => {
    const { cache, created, retired } = setup(async () => ready(first));
    const original = await cache.initialise();
    expect(await cache.initialise(true)).toBe(original);
    expect(created).toHaveLength(1);
    expect(retired).toHaveLength(0);
  });

  test("a project change hides the old client immediately and retires it before replacement", async () => {
    let read = async () => ready(first);
    const { cache, created, retired } = setup(() => read());
    const original = await cache.initialise();
    const response = deferred<MealDeckBackendResult>();
    read = () => response.promise;
    const changing = cache.initialise(true);
    expect(cache.get()).toBeNull();
    response.resolve(ready(second));
    const replacement = await changing;
    expect(replacement).not.toBe(original);
    expect(replacement.backend).toEqual(second);
    expect(cache.get()).toBe(replacement);
    expect(retired).toEqual([original]);
    expect(created).toHaveLength(2);
  });

  test("a rotated public key also replaces the client without borrowing old credentials", async () => {
    let selected = first;
    const { cache, retired } = setup(async () => ready(selected));
    const original = await cache.initialise();
    selected = { ...first, publishableKey: "sb_publishable_rotated_project_test_key" };
    const replacement = await cache.initialise(true);
    expect(replacement).not.toBe(original);
    expect(replacement.backend.publishableKey).toBe(selected.publishableKey);
    expect(retired).toEqual([original]);
  });

  test("configuration and network failures never restore the prior project", async () => {
    let response: MealDeckBackendResult = ready(first);
    let fail = false;
    const { cache, retired } = setup(async () => {
      if (fail) throw new Error("network unavailable");
      return response;
    });
    const original = await cache.initialise();
    response = {
      status: "unconfigured",
      reason: "legacy_conflict",
      message: "Remove conflicting legacy settings.",
    };
    await expect(cache.initialise(true)).rejects.toThrow("Remove conflicting legacy settings.");
    expect(cache.get()).toBeNull();
    expect(retired).toEqual([original]);
    response = ready(first);
    const next = await cache.initialise();
    fail = true;
    await expect(cache.initialise(true)).rejects.toThrow("network unavailable");
    expect(cache.get()).toBeNull();
    expect(retired).toEqual([original, next]);
  });

  test("logout during bootstrap prevents a late response replacing the next session", async () => {
    const oldResponse = deferred<MealDeckBackendResult>();
    let count = 0;
    const { cache, created } = setup(() =>
      ++count === 1 ? oldResponse.promise : Promise.resolve(ready(second)),
    );
    const previous = cache.initialise();
    await Promise.resolve(); // Allow the first bootstrap to reach its async read.
    cache.reset();
    const next = await cache.initialise();
    oldResponse.resolve(ready(first));
    await expect(previous).rejects.toThrow("The staff connection changed");
    expect(cache.get()).toBe(next);
    expect(next.backend).toEqual(second);
    expect(created).toHaveLength(1);
  });

  test("logout while refreshing retires the former client once and drops its response", async () => {
    let response = Promise.resolve(ready(first));
    const { cache, retired } = setup(() => response);
    const original = await cache.initialise();
    const stale = deferred<MealDeckBackendResult>();
    response = stale.promise;
    const refreshing = cache.initialise(true);
    await Promise.resolve();
    cache.reset();
    response = Promise.resolve(ready(second));
    const next = await cache.initialise();
    stale.resolve(ready(first));
    await expect(refreshing).rejects.toThrow("The staff connection changed");
    expect(retired).toEqual([original]);
    expect(cache.get()).toBe(next);
  });

  test("malformed bootstrap data cannot create a privileged browser client", async () => {
    const { cache, created } = setup(async () =>
      ready({
        ...first,
        publishableKey: "sb_secret_test_privileged_key_must_not_be_public",
      }),
    );
    await expect(cache.initialise()).rejects.toThrow("could not be verified");
    expect(created).toHaveLength(0);
    expect(cache.get()).toBeNull();
  });

  test("a synchronous bootstrap failure does not leave a permanently rejected cache", async () => {
    let shouldFail = true;
    const { cache, created } = setup(() => {
      if (shouldFail) throw new Error("bootstrap failed");
      return Promise.resolve(ready(first));
    });
    await expect(cache.initialise()).rejects.toThrow("bootstrap failed");
    shouldFail = false;
    expect(await cache.initialise()).toBe(cache.get()!);
    expect(created).toHaveLength(1);
  });
});
