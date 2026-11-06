import { describe, expect, test } from "bun:test";
import {
  cashAttemptKey,
  clearCashAttempt,
  readCashAttempt,
  saveCashAttempt,
  type CashAttempt,
} from "../src/lib/mealdeck-cash-recovery";

const uid = (suffix: number) => `00000000-0000-4000-8000-${suffix.toString().padStart(12, "0")}`;
const scope = { tenantId: uid(1), locationId: uid(2) };
const key = cashAttemptKey(scope, uid(3));
const attempt: CashAttempt = {
  version: 1,
  quoteId: uid(4),
  attemptId: uid(5),
  createdAt: "2026-11-06T20:00:00Z",
};
function memory() {
  const values = new Map<string, string>();
  return {
    getItem: (name: string) => values.get(name) ?? null,
    setItem: (name: string, value: string) => {
      values.set(name, value);
    },
    removeItem: (name: string) => {
      values.delete(name);
    },
  };
}

describe("cash confirmation recovery", () => {
  test("reload retains only the original quote/attempt and no customer details", () => {
    const storage = memory();
    expect(readCashAttempt(storage, key)).toBeNull();
    saveCashAttempt(storage, key, attempt);
    expect(readCashAttempt(storage, key)).toEqual(attempt);
    expect(Object.keys(JSON.parse(storage.getItem(key)!)).sort()).toEqual([
      "attemptId",
      "createdAt",
      "quoteId",
      "version",
    ]);
    saveCashAttempt(storage, key, attempt);
    expect(readCashAttempt(storage, key)).toEqual(attempt);
  });
  test("a second order cannot overwrite an unresolved confirmation", () => {
    const storage = memory();
    saveCashAttempt(storage, key, attempt);
    expect(() => saveCashAttempt(storage, key, { ...attempt, attemptId: uid(6) })).toThrow(
      "unfinished cash order",
    );
    expect(() => saveCashAttempt(storage, key, { ...attempt, quoteId: uid(7) })).toThrow(
      "unfinished cash order",
    );
    expect(readCashAttempt(storage, key)).toEqual(attempt);
  });
  test("a late result cannot delete another attempt", () => {
    const storage = memory();
    saveCashAttempt(storage, key, attempt);
    expect(() => clearCashAttempt(storage, key, { ...attempt, attemptId: uid(8) })).toThrow(
      "Another cash order",
    );
    expect(readCashAttempt(storage, key)).toEqual(attempt);
    clearCashAttempt(storage, key, attempt);
    clearCashAttempt(storage, key, attempt);
    expect(readCashAttempt(storage, key)).toBeNull();
  });
  test("staff and kitchen recovery are isolated", () => {
    expect(cashAttemptKey(scope, uid(9))).not.toBe(key);
    expect(cashAttemptKey({ ...scope, locationId: uid(10) }, uid(3))).not.toBe(key);
    expect(cashAttemptKey({ ...scope, tenantId: uid(11) }, uid(3))).not.toBe(key);
    expect(() => cashAttemptKey({ ...scope, tenantId: "" }, uid(3))).toThrow("authorised kitchen");
  });
  test("corrupt state fails closed instead of allowing another cash payment", () => {
    for (const value of [
      "{}",
      "invalid",
      JSON.stringify({ ...attempt, attemptId: "bad" }),
      JSON.stringify({ ...attempt, createdAt: "not-a-date" }),
      JSON.stringify({ ...attempt, customerName: "must not persist" }),
    ]) {
      const storage = memory();
      storage.setItem(key, value);
      expect(() => readCashAttempt(storage, key)).toThrow("unfinished cash-order record");
      expect(() => saveCashAttempt(storage, key, attempt)).toThrow();
      expect(storage.getItem(key)).toBe(value);
    }
  });
  test("blocked or silently failing storage prevents confirmation recovery from being lost", () => {
    const readBlocked = {
      ...memory(),
      getItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => readCashAttempt(readBlocked, key)).toThrow("cannot read cash-order recovery");
    const writeBlocked = {
      ...memory(),
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(() => saveCashAttempt(writeBlocked, key, attempt)).toThrow(
      "cannot save cash-order recovery",
    );
    const ignoredWrite = { ...memory(), setItem: () => {} };
    expect(() => saveCashAttempt(ignoredWrite, key, attempt)).toThrow(
      "cannot save cash-order recovery",
    );
  });
  test("failed cleanup retains the confirmed attempt for safe lookup next time", () => {
    const storage = memory();
    saveCashAttempt(storage, key, attempt);
    expect(() => clearCashAttempt({ ...storage, removeItem: () => {} }, key, attempt)).toThrow(
      "could not clear",
    );
    expect(readCashAttempt(storage, key)).toEqual(attempt);
  });
});
