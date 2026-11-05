import { z } from "zod";
import { isLaunchBrandPriceApproved } from "./launch-menu-catalogue";
import {
  addLaunchPick,
  encodeLaunchPicks,
  findLaunchMenuItem,
  launchPickCount,
  MAX_LAUNCH_PICKS,
  type LaunchMenuPick,
} from "./launch-menu-picks";

/** Browser-only planning. No identity, price, payment or order authority. */
export const GROUP_PLAN_STORAGE_KEY = "mealdeck-group-plan-v1";
export const MAX_GROUP_PEOPLE = 10;
export const MAX_GROUP_LINK_LENGTH = 24_000;
const uuid = z.string().uuid();
const sourceId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,119}$/);
const wirePickSchema = z.strictObject({
  brandId: sourceId,
  itemId: sourceId,
  quantity: z.number().int().min(1).max(20),
  selections: z
    .record(sourceId, z.array(sourceId).max(30))
    .refine((value) => Object.keys(value).length <= 30),
  crossSelections: z
    .array(
      z.strictObject({
        slot: z.enum(["side", "drink"]),
        mode: z.enum(["upgrade", "extra"]),
        brandId: z.enum(["loadd", "moktl"]),
        itemId: sourceId,
      }),
    )
    .max(2)
    .optional(),
});
type WirePick = z.infer<typeof wirePickSchema>;
const inviteSchema = z.strictObject({
  version: z.literal(1),
  kind: z.literal("invite"),
  groupId: uuid,
  inviteId: uuid,
});
const replySchema = z.strictObject({
  version: z.literal(1),
  kind: z.literal("reply"),
  groupId: uuid,
  inviteId: uuid,
  responseId: uuid,
  picks: z.array(wirePickSchema).min(1).max(MAX_LAUNCH_PICKS),
});
const linkSchema = z.discriminatedUnion("kind", [inviteSchema, replySchema]);
export type GroupInvitation = z.infer<typeof inviteSchema>;
export type GroupReply = Omit<z.infer<typeof replySchema>, "picks"> & { picks: LaunchMenuPick[] };
export type GroupLink = GroupInvitation | GroupReply;
export type GroupPerson = {
  id: string;
  label: string;
  picks: LaunchMenuPick[];
  responseId: string | null;
  reviewedResponseIds: string[];
};
export type GroupPlan = {
  version: 1;
  id: string;
  revision: number;
  people: GroupPerson[];
};
export type GroupCheckoutPacking = {
  separateBags: true;
  bagCount: number;
  allocations: { lineId: string; bag: number; quantity: number }[];
};
export type GroupCheckoutTransfer = {
  groupId: string;
  picks: LaunchMenuPick[];
  packing: GroupCheckoutPacking;
  /** Local-only labels. Never included in a link, quote or provider request. */
  bags: { number: number; label: string }[];
};

export class GroupPlanProblem extends Error {}

function fail(message: string): never {
  throw new GroupPlanProblem(message);
}

function wirePicks(picks: LaunchMenuPick[]): WirePick[] {
  return (JSON.parse(encodeLaunchPicks(picks)) as { picks: WirePick[] }).picks;
}

function choicesFingerprint(pick: WirePick) {
  return JSON.stringify({
    brandId: pick.brandId,
    itemId: pick.itemId,
    quantity: pick.quantity,
    selections: Object.entries(pick.selections)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([group, options]) => [group, [...options].sort()]),
    crossSelections: [...(pick.crossSelections ?? [])]
      .sort((left, right) => left.slot.localeCompare(right.slot))
      .map(({ slot, mode, brandId, itemId }) => [slot, mode, brandId, itemId]),
  });
}

/** Strict and atomic: never silently drop an unknown option, stale dish or excess quantity. */
export function validateGroupPicks(input: unknown): LaunchMenuPick[] {
  const parsed = z.array(wirePickSchema).max(MAX_LAUNCH_PICKS).safeParse(input);
  if (!parsed.success) fail("These choices are incomplete or invalid. Ask for a fresh reply link.");
  let result: LaunchMenuPick[] = [];
  for (const pick of parsed.data) {
    const found = findLaunchMenuItem(pick.brandId, pick.itemId);
    if (!found || !isLaunchBrandPriceApproved(pick.brandId))
      fail("A dish in these choices has changed. Please choose it again from the current menu.");
    const single = addLaunchPick(
      [],
      pick.brandId,
      pick.itemId,
      pick.selections,
      pick.quantity,
      pick.crossSelections,
    )[0];
    if (!single || choicesFingerprint(pick) !== choicesFingerprint(single))
      fail("A flavour, portion or extra has changed. Please choose the item again.");
    const next = addLaunchPick(
      result,
      single.brandId,
      single.itemId,
      single.selections,
      single.quantity,
      single.crossSelections,
    );
    if (next === result)
      fail("Keep the group to 60 selections in total and 20 of each exact dish and configuration.");
    result = next;
  }
  return result;
}

function checkedId(value: string) {
  if (!uuid.safeParse(value).success) fail("This invitation is not valid. Ask for a new link.");
  return value;
}

export function groupPersonLabel(value: string) {
  const label = value.trim().replace(/\s+/g, " ");
  if (
    !label ||
    label.length > 32 ||
    [...label].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || (code >= 127 && code <= 159);
    })
  )
    fail("Use a short name or nickname, up to 32 characters.");
  return label;
}

export function createGroupPlan(id: string = crypto.randomUUID()): GroupPlan {
  return {
    version: 1,
    id: checkedId(id),
    revision: 0,
    people: [
      { id: "organiser", label: "My bag", picks: [], responseId: null, reviewedResponseIds: [] },
    ],
  };
}

export function addGroupPerson(
  plan: GroupPlan,
  label: string,
  id: string = crypto.randomUUID(),
): GroupPlan {
  if (plan.people.length >= MAX_GROUP_PEOPLE)
    fail("A group can have up to 10 people, including you.");
  checkedId(id);
  if (plan.people.some((person) => person.id === id)) fail("This invitation already exists.");
  return {
    ...plan,
    revision: plan.revision + 1,
    people: [
      ...plan.people,
      { id, label: groupPersonLabel(label), picks: [], responseId: null, reviewedResponseIds: [] },
    ],
  };
}

export function removeGroupPerson(plan: GroupPlan, id: string): GroupPlan {
  if (id === "organiser")
    fail("Your own bag stays in the group. You can remove its items instead.");
  return {
    ...plan,
    revision: plan.revision + 1,
    people: plan.people.filter((person) => person.id !== id),
  };
}

export function groupInvitation(plan: GroupPlan, id: string): GroupInvitation {
  if (id === "organiser" || !plan.people.some((person) => person.id === id))
    fail("That person is no longer in this draft. Create a new invitation.");
  return { version: 1, kind: "invite", groupId: plan.id, inviteId: checkedId(id) };
}

export function makeGroupReply(
  invite: GroupInvitation,
  picks: LaunchMenuPick[],
  responseId: string = crypto.randomUUID(),
): GroupReply {
  const invitation = inviteSchema.safeParse(invite);
  if (!invitation.success) fail("This invitation is not valid. Ask for a new link.");
  const clean = validateGroupPicks(wirePicks(picks));
  if (!clean.length) fail("Choose at least one item before making your reply link.");
  return { ...invitation.data, kind: "reply", responseId: checkedId(responseId), picks: clean };
}

export function makeGroupLink(payload: GroupLink, origin: string): string {
  const input =
    payload.kind === "reply" ? { ...payload, picks: wirePicks(payload.picks) } : payload;
  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) fail("This link could not be made. Please review your choices.");
  if (parsed.data.kind === "reply") validateGroupPicks(parsed.data.picks);
  const bytes = new TextEncoder().encode(JSON.stringify(parsed.data));
  const encoded = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const url = new URL("/group-order", origin);
  if (!["https:", "http:"].includes(url.protocol))
    fail("Open MealDeck in your browser to share a link.");
  url.hash = "g=" + encoded;
  if (url.href.length > MAX_GROUP_LINK_LENGTH)
    fail("This reply is too long to share safely. Remove a few different items and try again.");
  return url.href;
}

/** No link is fetched. Only the fragment is decoded; identity/payment are never trusted. */
export function parseGroupLink(input: string, origin?: string): GroupLink {
  const raw = input.trim();
  if (!raw || raw.length > MAX_GROUP_LINK_LENGTH)
    fail("That link is missing or too long. Ask for a fresh link.");
  let fragment = raw;
  if (!raw.startsWith("#")) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return fail("Paste the full MealDeck invitation or reply link.");
    }
    const allowedOrigins = [
      "https://mealdeck.co.uk",
      "https://www.mealdeck.co.uk",
      ...(origin ? [origin] : []),
    ];
    if (
      !allowedOrigins.includes(url.origin) ||
      url.pathname !== "/group-order" ||
      url.search ||
      url.username ||
      url.password
    )
      fail("Use a MealDeck group-order link from this site.");
    fragment = url.hash;
  }
  if (!/^#g=[A-Za-z0-9_-]+$/.test(fragment))
    fail("This group link is not valid. Ask for a fresh one.");
  try {
    const binary = atob(fragment.slice(3).replace(/-/g, "+").replace(/_/g, "/"));
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(binary, (char) => char.charCodeAt(0)),
    );
    const parsed = linkSchema.safeParse(JSON.parse(decoded));
    if (!parsed.success) return fail("This group link is not valid. Ask for a fresh one.");
    return parsed.data.kind === "reply"
      ? { ...parsed.data, picks: validateGroupPicks(parsed.data.picks) }
      : parsed.data;
  } catch (error) {
    if (error instanceof GroupPlanProblem) throw error;
    return fail("This group link could not be read. Copy the entire link and try again.");
  }
}

function combinedPicks(plan: GroupPlan) {
  return validateGroupPicks(plan.people.flatMap((person) => wirePicks(person.picks)));
}

export function updateOrganiserPicks(plan: GroupPlan, picks: LaunchMenuPick[]): GroupPlan {
  const clean = validateGroupPicks(wirePicks(picks));
  const next = {
    ...plan,
    revision: plan.revision + 1,
    people: plan.people.map((person) =>
      person.id === "organiser" ? { ...person, picks: clean } : person,
    ),
  };
  combinedPicks(next);
  return next;
}

export function inspectGroupReply(plan: GroupPlan, reply: GroupReply) {
  if (reply.groupId !== plan.id)
    fail(
      "This reply belongs to a different group. Open it in the organiser’s original browser and draft.",
    );
  const person = plan.people.find((entry) => entry.id === reply.inviteId);
  if (!person || person.id === "organiser")
    fail("This invitation is no longer in your draft. Ask them to use a new invitation.");
  const clean = makeGroupReply(groupInvitation(plan, person.id), reply.picks, reply.responseId);
  const sameChoices = encodeLaunchPicks(person.picks) === encodeLaunchPicks(clean.picks);
  if (person.responseId === clean.responseId && !sameChoices)
    fail(
      "This reply identifier was already used for different choices. Ask for a fresh reply link.",
    );
  if (person.responseId === clean.responseId || sameChoices)
    return { status: "unchanged" as const, person, reply: clean };
  if (person.reviewedResponseIds.includes(clean.responseId))
    return { status: "older" as const, person, reply: clean };
  const candidate = {
    ...plan,
    people: plan.people.map((entry) =>
      entry.id === person.id ? { ...entry, picks: clean.picks } : entry,
    ),
  };
  combinedPicks(candidate);
  return {
    status: person.picks.length ? ("replace" as const) : ("new" as const),
    person,
    reply: clean,
  };
}

export function acceptGroupReply(plan: GroupPlan, reply: GroupReply): GroupPlan {
  const review = inspectGroupReply(plan, reply);
  if (review.status === "unchanged" && review.person.reviewedResponseIds.includes(reply.responseId))
    return plan;
  if (review.status === "older")
    fail("You already reviewed this older reply. Keep the newer choices or ask for a fresh link.");
  // Keep a bounded history. At the limit, require a new invitation instead of forgetting replays.
  if (review.person.reviewedResponseIds.length >= 100)
    fail("This invitation has had many revisions. Remove it and send a fresh invitation.");
  return {
    ...plan,
    revision: plan.revision + 1,
    people: plan.people.map((person) =>
      person.id === reply.inviteId
        ? {
            ...person,
            picks: review.reply.picks,
            responseId: review.reply.responseId,
            reviewedResponseIds: [...person.reviewedResponseIds, review.reply.responseId],
          }
        : person,
    ),
  };
}

export function buildGroupCheckout(plan: GroupPlan): GroupCheckoutTransfer {
  const picks = combinedPicks(plan);
  if (!picks.length) fail("Add or import someone’s choices before reviewing the group order.");
  const people = plan.people.filter((person) => person.picks.length > 0);
  const lineIds = new Map(picks.map((pick, index) => [pick.key, "line-" + (index + 1)]));
  return {
    groupId: plan.id,
    picks,
    packing: {
      separateBags: true,
      bagCount: people.length,
      allocations: people.flatMap((person, index) =>
        person.picks.map((pick) => ({
          lineId: lineIds.get(pick.key)!,
          bag: index + 1,
          quantity: pick.quantity,
        })),
      ),
    },
    bags: people.map((person, index) => ({ number: index + 1, label: person.label })),
  };
}

const storedPlanSchema = z.strictObject({
  version: z.literal(1),
  id: uuid,
  revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  people: z
    .array(
      z.strictObject({
        id: z.union([z.literal("organiser"), uuid]),
        label: z.string().min(1).max(32),
        picks: z.array(wirePickSchema).max(MAX_LAUNCH_PICKS),
        responseId: uuid.nullable(),
        reviewedResponseIds: z.array(uuid).max(100),
      }),
    )
    .min(1)
    .max(MAX_GROUP_PEOPLE),
});

export function encodeGroupPlan(plan: GroupPlan) {
  return JSON.stringify({
    ...plan,
    people: plan.people.map((person) => ({ ...person, picks: wirePicks(person.picks) })),
  });
}

export function decodeGroupPlan(raw: string): GroupPlan {
  if (raw.length > 200_000) fail("This saved group draft is too large to restore.");
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    return fail("This saved group draft could not be read.");
  }
  const parsed = storedPlanSchema.safeParse(input);
  if (!parsed.success)
    fail("This saved group draft could not be read. Start a new group to continue.");
  const plan: GroupPlan = {
    ...parsed.data,
    people: parsed.data.people.map((person) => ({
      ...person,
      label: groupPersonLabel(person.label),
      picks: validateGroupPicks(person.picks),
    })),
  };
  if (
    plan.people[0]?.id !== "organiser" ||
    new Set(plan.people.map((person) => person.id)).size !== plan.people.length
  )
    fail("This saved group has invalid invitations. Start a new group to continue.");
  combinedPicks(plan);
  return plan;
}

export function groupPlanCount(plan: GroupPlan) {
  return plan.people.reduce((count, person) => count + launchPickCount(person.picks), 0);
}
