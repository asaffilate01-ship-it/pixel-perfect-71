import { decodeLaunchPicks, encodeLaunchPicks, type LaunchMenuPick } from "./launch-menu-picks";
import { z } from "zod";
import {
  decodeGroupPlan,
  encodeGroupPlan,
  GROUP_PLAN_STORAGE_KEY,
  GroupPlanProblem,
  validateGroupPicks,
  type GroupInvitation,
  type GroupPlan,
} from "./mealdeck-group-plan";

export type StoredGroupPlan = {
  plan: GroupPlan | null;
  raw: string | null;
  saved: boolean;
  error: string | null;
};
let memoryPlan: StoredGroupPlan | null = null;
const replyMemory = new Map<string, GroupReplyDraft>();
export type GroupReplyDraft = { picks: LaunchMenuPick[]; responseId: string; saved: boolean };

export function readStoredGroupPlan(): StoredGroupPlan {
  if (memoryPlan && !memoryPlan.saved) return memoryPlan;
  try {
    const raw = localStorage.getItem(GROUP_PLAN_STORAGE_KEY);
    const value = { plan: raw ? decodeGroupPlan(raw) : null, raw, saved: true, error: null };
    memoryPlan = value;
    return value;
  } catch (error) {
    if (error instanceof GroupPlanProblem)
      return { plan: null, raw: null, saved: true, error: error.message };
    return memoryPlan ?? { plan: null, raw: null, saved: false, error: null };
  }
}

/** Also checked immediately before handoff, when no draft write otherwise occurs. */
export function assertStoredGroupPlanCurrent(expectedRaw: string | null) {
  try {
    if (localStorage.getItem(GROUP_PLAN_STORAGE_KEY) !== expectedRaw)
      throw new GroupPlanProblem(
        "Your group draft changed in another tab. Reload this page before continuing.",
      );
  } catch (error) {
    if (error instanceof GroupPlanProblem) throw error;
    // The current visit still works when storage is wholly unavailable.
  }
}

/** Compare before writing so another organiser tab cannot silently lose changes. */
export function saveStoredGroupPlan(
  plan: GroupPlan,
  expectedRaw: string | null,
  replaceUnreadable = false,
): StoredGroupPlan {
  const raw = encodeGroupPlan(plan);
  let saved = false;
  try {
    if (!replaceUnreadable && localStorage.getItem(GROUP_PLAN_STORAGE_KEY) !== expectedRaw)
      throw new GroupPlanProblem(
        "Your group draft changed in another tab. Reload this page before saving more choices.",
      );
    localStorage.setItem(GROUP_PLAN_STORAGE_KEY, raw);
    saved = true;
  } catch (error) {
    if (error instanceof GroupPlanProblem) throw error;
    // An unavailable/quota-limited browser still supports the current visit.
  }
  memoryPlan = { plan, raw: saved ? raw : expectedRaw, saved, error: null };
  return memoryPlan;
}

function replyKey(invite: GroupInvitation) {
  return "mealdeck-group-reply-v1:" + invite.groupId + ":" + invite.inviteId;
}

export function readGroupReplyDraft(invite: GroupInvitation): GroupReplyDraft | null {
  const key = replyKey(invite);
  const memory = replyMemory.get(key);
  if (memory && !memory.saved) return memory;
  try {
    const raw = localStorage.getItem(key);
    if (!raw || raw.length > 100_000) return memory ?? null;
    const value = JSON.parse(raw) as { responseId?: unknown; basket?: unknown };
    if (
      typeof value.responseId !== "string" ||
      !z.uuid().safeParse(value.responseId).success ||
      typeof value.basket !== "string"
    )
      return null;
    // Validate the raw choices before the tolerant personal-basket decoder runs.
    const input = JSON.parse(value.basket) as { version?: unknown; picks?: unknown } | null;
    if (!input || input.version !== 1) return null;
    validateGroupPicks(input.picks);
    return { picks: decodeLaunchPicks(value.basket), responseId: value.responseId, saved: true };
  } catch {
    return memory ?? null;
  }
}

export function saveGroupReplyDraft(
  invite: GroupInvitation,
  picks: LaunchMenuPick[],
  responseId: string,
): GroupReplyDraft {
  const value: GroupReplyDraft = { picks, responseId, saved: false };
  const key = replyKey(invite);
  try {
    localStorage.setItem(key, JSON.stringify({ responseId, basket: encodeLaunchPicks(picks) }));
    value.saved = true;
  } catch {
    /* The same-tab draft remains usable. */
  }
  replyMemory.set(key, value);
  return value;
}
