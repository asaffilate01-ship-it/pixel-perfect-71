import { z } from "zod";
import type {
  LaunchMenuBrand,
  LaunchMenuItem,
  LaunchMenuOptionGroup,
} from "./launch-menu-catalogue";
import {
  addLaunchPick,
  findLaunchMenuItem,
  isLaunchGroupActive,
  launchItemGroups,
  launchPickCount,
  launchSelectionLabels,
  MAX_LAUNCH_PICKS,
  MAX_LAUNCH_PICK_QUANTITY,
  missingLaunchChoices,
  setLaunchPickQuantity,
  updateLaunchPick,
  type LaunchMenuPick,
  type LaunchMenuSelections,
} from "./launch-menu-picks";
import {
  cleanLaunchCrossConfiguration,
  getLaunchCrossOffers,
  isMappedLaunchUpgradeOption,
  launchCrossSelectionSummaries,
  setLaunchCrossChoice,
  type LaunchCrossOffer,
  type LaunchCrossSelection,
} from "./launch-menu-upsells";
import {
  formatLaunchMenuPrice,
  launchMenuBasketDisplayPrice,
  launchMenuCrossChoicePrice,
  launchMenuPickDisplayPrice,
} from "./launch-menu-display-prices";
import {
  hydrateMealDeckPublicMenu,
  parseMealDeckPublicMenu,
  type MealDeckPublicMenuSnapshot,
} from "./mealdeck-public-menu";
import { normalizeCustomerName, normalizeCustomerPhone } from "./mealdeck-customer";
import { parseKerbsideVehicle } from "./mealdeck-opening-offer";
import { normaliseOrderNotes } from "./mealdeck-order-notes";

/**
 * A deterministic, side-effect-free ordering conversation. This module can
 * request a secure review link, but cannot create a quote, take a payment,
 * confirm an order or release a kitchen ticket. Transport must load/save the
 * draft against its authenticated channel identity and serialize revisions.
 */
const sourceId = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(180);
const brandId = z.enum(["tavo-chicken", "moktl", "loadd", "skorch-burgers", "souvano"]);
const safePlainText = (value: string) =>
  !/[\p{Cc}\p{Cf}]/u.test(value) && !/[\uD800-\uDFFF]/u.test(value);
const crossSchema = z
  .object({
    slot: z.enum(["side", "drink"]),
    mode: z.enum(["upgrade", "extra"]),
    brandId: z.enum(["loadd", "moktl"]),
    itemId: sourceId,
  })
  .strict();
const selectionsSchema = z
  .record(sourceId, z.array(sourceId).max(30))
  .refine((value) => Object.keys(value).length <= 20);
const pickSchema = z
  .object({
    key: z.string().max(16_000),
    brandId,
    itemId: sourceId,
    quantity: z.number().int().min(1).max(MAX_LAUNCH_PICK_QUANTITY),
    selections: selectionsSchema,
    crossSelections: z.array(crossSchema).max(2).optional(),
  })
  .strict()
  .transform(({ crossSelections, ...value }): LaunchMenuPick => ({
    ...value,
    ...(crossSelections ? { crossSelections } : {}),
  }));

export const whatsAppDraftSchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: z.number().int().min(0).max(2_147_483_647),
    stage: z.enum([
      "fulfilment",
      "name",
      "phone",
      "vehicle_make",
      "vehicle_colour",
      "vehicle_registration",
      "consent",
      "menu",
      "options",
      "extras",
      "cross",
      "quantity",
      "item_review",
      "cutlery",
      "packing_count",
      "packing_allocations",
      "notes",
      "review",
      "handoff",
      "checkout",
    ]),
    fulfilment: z.enum(["pickup", "curbside"]),
    customer: z
      .object({
        name: z.string().max(120).refine(safePlainText),
        phone: z
          .string()
          .max(16)
          .refine((value) => value === "" || /^\+[1-9]\d{7,14}$/.test(value)),
      })
      .strict(),
    vehicle: z
      .object({
        make: z.string().max(60).refine(safePlainText),
        colour: z.string().max(40).refine(safePlainText),
        registrationLast4: z.string().regex(/^(?:[A-Z0-9]{4})?$/),
      })
      .strict()
      .nullable(),
    picks: z
      .array(pickSchema)
      .max(MAX_LAUNCH_PICKS)
      .refine((picks) => launchPickCount(picks) <= MAX_LAUNCH_PICKS),
    notes: z
      .string()
      .max(2_000)
      .refine((value) => {
        try {
          normaliseOrderNotes(value);
          return true;
        } catch {
          return false;
        }
      }),
    // This is checkoutQuoteInput.packing, NOT the canonical MealDeckPackingPlan.
    packingPlan: z
      .object({
        cutleryRequested: z.boolean(),
        separateBags: z.boolean(),
        bagCount: z.number().int().min(1).max(3),
        allocations: z
          .array(
            z
              .object({
                lineId: z.string().regex(/^line-([1-9]|[1-5][0-9]|60)$/),
                bag: z.number().int().min(1).max(3),
                quantity: z.number().int().min(1).max(MAX_LAUNCH_PICK_QUANTITY),
              })
              .strict(),
          )
          .max(180),
      })
      .strict(),
    orderUpdatesConsent: z.boolean(),
    marketingConsent: z.boolean(),
    handoffReason: z
      .string()
      .regex(/^[a-z_]{1,60}$/)
      .nullable(),
    checkoutLocked: z.boolean(),
    editing: z
      .object({
        brandId,
        itemId: sourceId,
        quantity: z.number().int().min(1).max(MAX_LAUNCH_PICK_QUANTITY),
        selections: selectionsSchema,
        crossSelections: z.array(crossSchema).max(2),
        editingIndex: z.number().int().min(0).max(59).nullable(),
        answeredGroups: z.array(sourceId).max(20),
        crossSlot: z.enum(["side", "drink"]).nullable(),
      })
      .strict()
      .nullable(),
    selectedBrandId: brandId.nullable(),
    menuPage: z.number().int().min(0).max(100),
  })
  .strict();

export type WhatsAppDraft = z.infer<typeof whatsAppDraftSchema>;
export type WhatsAppConversationContext = {
  available: boolean;
  estimateMinutes: number | null;
  guestEligible: boolean;
  /** Read from the scoped canonical store; never a customer/model assertion. */
  canStartNewOrder?: boolean;
};
export type WhatsAppReply = {
  text: string;
  buttons?: { id: string; title: string }[];
  list?: { title: string; rows: { id: string; title: string; description?: string }[] }[];
};
export type WhatsAppConversationInput = { text: string; actionId?: string; proposal?: unknown };
export type WhatsAppConversationResult = {
  draft: WhatsAppDraft;
  replies: WhatsAppReply[];
  requestCheckout: boolean;
  handoffReason?: string;
};
export type WhatsAppCatalogue = { checkedAt: string; brands: LaunchMenuBrand[] };

/** Strict model output: stable IDs and intent only; never text, money or authority. */
export const whatsAppProposalSchema = z
  .object({
    intent: z.enum([
      "browse_menu",
      "select_item",
      "add_item",
      "edit_item",
      "remove_item",
      "set_quantity",
      "review",
      "help",
      "unknown",
    ]),
    brandId: brandId.nullable(),
    itemId: sourceId.nullable(),
    quantity: z.number().int().min(0).max(MAX_LAUNCH_PICK_QUANTITY).nullable(),
    lineNumber: z.number().int().min(1).max(MAX_LAUNCH_PICKS).nullable(),
    selections: z
      .array(
        z
          .object({
            groupId: sourceId,
            optionIds: z.array(sourceId).max(30),
          })
          .strict(),
      )
      .max(20)
      .nullable(),
    crossSelections: z.array(crossSchema).max(2).nullable(),
  })
  .strict();
export const whatsAppProposalJsonSchema = z.toJSONSchema(whatsAppProposalSchema);
export type WhatsAppProposal = z.infer<typeof whatsAppProposalSchema>;

export function createWhatsAppDraft(): WhatsAppDraft {
  return {
    schemaVersion: 1,
    revision: 0,
    stage: "fulfilment",
    fulfilment: "pickup",
    customer: { name: "", phone: "" },
    vehicle: null,
    picks: [],
    notes: "",
    packingPlan: { cutleryRequested: false, separateBags: false, bagCount: 1, allocations: [] },
    orderUpdatesConsent: false,
    marketingConsent: false,
    handoffReason: null,
    checkoutLocked: false,
    editing: null,
    selectedBrandId: null,
    menuPage: 0,
  };
}

export function parseWhatsAppDraft(value: unknown): WhatsAppDraft | null {
  const parsed = whatsAppDraftSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Missing live data never falls back to source-template prices or availability. */
export function normaliseWhatsAppCatalogue(value: unknown): WhatsAppCatalogue | null {
  const snapshot = parseMealDeckPublicMenu(value);
  if (!snapshot || snapshot.items.length > 1_000) return null;
  for (const item of snapshot.items) {
    if (
      !sourceId.safeParse(item.sku).success ||
      item.name.length > 180 ||
      (item.description?.length ?? 0) > 4_000 ||
      Object.keys(item.options).length > 200
    )
      return null;
  }
  const brands = hydrateMealDeckPublicMenu(snapshot)
    .map((brand) => ({
      ...brand,
      sections: brand.sections
        .map((section) => ({
          ...section,
          items: section.items.filter(
            (item) => item.available === true && item.pricePence !== null,
          ),
        }))
        .filter((section) => section.items.length > 0),
    }))
    .filter((brand) => brand.sections.length > 0);
  return { checkedAt: snapshot.checkedAt, brands };
}

// The transport validates UTF-16 lengths. Keep within those bounds without
// cutting an astral Unicode character in half.
const clip = (value: string, length: number) => {
  let result = "";
  for (const character of value) {
    if (result.length + character.length > length) break;
    result += character;
  }
  return result;
};
const label = (value: string, length = 180) =>
  clip(
    value
      .replace(/[\p{Cc}\p{Cf}]/gu, " ")
      .replace(/\s+/g, " ")
      .trim(),
    length,
  );
const actionId = (draft: WhatsAppDraft, verb: string, value?: string | number) =>
  `mdw:${draft.revision}:${verb}${value === undefined ? "" : `:${value}`}`;
type Choice = { verb: string; value?: string | number; title: string; description?: string };

function textReplies(text: string): WhatsAppReply[] {
  const chunks: WhatsAppReply[] = [];
  let current = "";
  for (const line of text.split("\n")) {
    if ((current + line).length > 3_900 && current) {
      chunks.push({ text: current.trimEnd() });
      current = "";
    }
    let remaining = line;
    while (remaining.length > 3_900) {
      if (current) {
        chunks.push({ text: current.trimEnd() });
        current = "";
      }
      const part = clip(remaining, 3_900);
      chunks.push({ text: part });
      remaining = remaining.slice(part.length);
    }
    current += remaining + "\n";
  }
  if (current.trim()) chunks.push({ text: current.trimEnd() });
  return chunks;
}

/** Meta interactive limits are enforced here; full reviews are plain-text chunks. */
function choices(draft: WhatsAppDraft, text: string, entries: Choice[], page = 0): WhatsAppReply[] {
  const prefix = text.length > 1_024 ? textReplies(text) : [];
  const body = prefix.length ? "Choose an option below." : text;
  if (!entries.length) return prefix.length ? prefix : [{ text: body }];
  const paged = entries.length > 10;
  const count = paged ? 9 : 10;
  const maxPage = Math.max(0, Math.ceil(entries.length / count) - 1);
  const currentPage = Math.min(page, maxPage);
  const shown = entries.slice(currentPage * count, (currentPage + 1) * count);
  if (paged)
    shown.push({
      verb: "page",
      value: currentPage < maxPage ? currentPage + 1 : 0,
      title: currentPage < maxPage ? "More choices" : "First choices",
    });
  if (shown.length <= 3 && shown.every((entry) => !entry.description)) {
    return [
      ...prefix,
      {
        text: body,
        buttons: shown.map((entry) => ({
          id: actionId(draft, entry.verb, entry.value),
          title: clip(label(entry.title), 20),
        })),
      },
    ];
  }
  return [
    ...prefix,
    {
      text: body,
      list: [
        {
          title: "MealDeck choices",
          rows: shown.map((entry) => ({
            id: actionId(draft, entry.verb, entry.value),
            title: clip(label(entry.title), 24),
            ...(entry.description ? { description: clip(label(entry.description), 72) } : {}),
          })),
        },
      ],
    },
  ];
}

function liveItem(catalogue: WhatsAppCatalogue, itemBrandId: string, itemId: string) {
  const found = findLaunchMenuItem(itemBrandId, itemId, catalogue.brands);
  return found?.brand.id === itemBrandId && found.item.available === true ? found : null;
}

function comparableSelections(selections: LaunchMenuSelections) {
  return JSON.stringify(
    Object.entries(selections)
      .filter(([, ids]) => ids.length)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([group, ids]) => [group, [...ids].sort()]),
  );
}
function comparableCross(selections: LaunchCrossSelection[]) {
  return JSON.stringify([...selections].sort((a, b) => a.slot.localeCompare(b.slot)));
}

/** Reject stale/foreign/inactive choices instead of silently cleaning them away. */
function validatePick(
  pick: Pick<LaunchMenuPick, "brandId" | "itemId" | "quantity" | "selections" | "crossSelections">,
  catalogue: WhatsAppCatalogue,
  complete = true,
): string | null {
  const found = liveItem(catalogue, pick.brandId, pick.itemId);
  if (!found) return "That item is currently unavailable. Choose another item from the live menu.";
  if (
    !Number.isInteger(pick.quantity) ||
    pick.quantity < 1 ||
    pick.quantity > MAX_LAUNCH_PICK_QUANTITY
  )
    return "Choose a quantity from 1 to 20.";
  const groups = launchItemGroups(found.brand, found.item);
  for (const [groupId, selected] of Object.entries(pick.selections)) {
    const group = groups.find((candidate) => candidate.id === groupId);
    if (
      !group ||
      new Set(selected).size !== selected.length ||
      (group.kind === "single" && selected.length > 1) ||
      selected.some(
        (id) =>
          !group.options.some((option) => option.id === id && option.available !== false) ||
          !found.item.availableOptionIds?.includes(id),
      )
    )
      return "A selected option is unavailable or does not belong to this dish. Please choose it again.";
  }
  const suppliedCross = pick.crossSelections ?? [];
  const clean = cleanLaunchCrossConfiguration(
    found.brand,
    found.item,
    pick.selections,
    suppliedCross,
  );
  if (
    comparableSelections(pick.selections) !== comparableSelections(clean.selections) ||
    comparableCross(suppliedCross) !== comparableCross(clean.crossSelections)
  )
    return "Those meal choices cannot be combined. Please customise the dish again.";
  for (const cross of suppliedCross) {
    const target = liveItem(catalogue, cross.brandId, cross.itemId);
    if (
      !target ||
      missingLaunchChoices(target.brand, target.item, {}).length ||
      launchMenuCrossChoicePrice(cross.mode, cross.brandId, cross.itemId, catalogue.brands) === null
    )
      return "That named extra or replacement is unavailable. Please choose it again.";
  }
  if (
    complete &&
    missingLaunchChoices(found.brand, found.item, clean.selections, clean.crossSelections).length
  )
    return "Please finish all required choices for this dish.";
  if (complete && launchMenuPickDisplayPrice(pick, catalogue.brands).itemsSubtotalPence === null)
    return "The current price or portion is unavailable. Please choose the dish again.";
  return null;
}

function availableGroupOptions(group: LaunchMenuOptionGroup, item: LaunchMenuItem) {
  return group.options.filter(
    (option) =>
      option.available !== false &&
      item.availableOptionIds?.includes(option.id) &&
      !isMappedLaunchUpgradeOption(option.id),
  );
}

function liveCrossOffers(draft: WhatsAppDraft, catalogue: WhatsAppCatalogue): LaunchCrossOffer[] {
  const editing = draft.editing;
  const found = editing && liveItem(catalogue, editing.brandId, editing.itemId);
  if (!editing || !found) return [];
  return getLaunchCrossOffers(found.brand, found.item, editing.selections)
    .map((offer) => ({
      ...offer,
      choices: offer.choices.flatMap((choice) => {
        const target = liveItem(catalogue, choice.brandId, choice.itemId);
        const price = launchMenuCrossChoicePrice(
          offer.mode,
          choice.brandId,
          choice.itemId,
          catalogue.brands,
        );
        return !target ||
          price === null ||
          missingLaunchChoices(target.brand, target.item, {}).length
          ? []
          : [{ ...choice, name: target.item.name, pricePence: price }];
      }),
    }))
    .filter((offer) => offer.choices.length > 0);
}

function nextGroup(draft: WhatsAppDraft, catalogue: WhatsAppCatalogue) {
  const editing = draft.editing;
  const found = editing && liveItem(catalogue, editing.brandId, editing.itemId);
  if (!editing || !found) return null;
  const groups = launchItemGroups(found.brand, found.item).filter((group) =>
    isLaunchGroupActive(group, editing.selections, found.item, editing.crossSelections),
  );
  // Required missing choices always take priority, including after an upgrade changes.
  return (
    groups.find((group) => group.required && !editing.selections[group.id]?.length) ??
    groups.find(
      (group) =>
        !editing.answeredGroups.includes(group.id) &&
        (availableGroupOptions(group, found.item).length > 0 ||
          !!editing.selections[group.id]?.length),
    ) ??
    null
  );
}

function pickDescription(pick: LaunchMenuPick, index: number, catalogue: WhatsAppCatalogue) {
  const found = liveItem(catalogue, pick.brandId, pick.itemId);
  if (!found)
    return `${index + 1}. ${pick.quantity} × Item currently unavailable — please edit or remove it.`;
  const selected = launchSelectionLabels(
    found.brand,
    found.item,
    pick.selections,
    pick.crossSelections,
  );
  const cross = launchCrossSelectionSummaries(
    found.brand,
    found.item,
    pick.selections,
    pick.crossSelections,
    catalogue.brands,
  );
  const price = launchMenuPickDisplayPrice(pick, catalogue.brands).itemsSubtotalPence;
  return [
    `${index + 1}. ${pick.quantity} × ${label(found.item.name)} · ${label(found.brand.name)}`,
    ...selected.map((option) => `   • ${label(option)}`),
    ...cross.map((option) => `   • ${label(option.label, 300)} (for each item)`),
    `   Menu estimate: ${formatLaunchMenuPrice(price)}`,
  ].join("\n");
}

function resetPacking(draft: WhatsAppDraft) {
  draft.packingPlan = {
    cutleryRequested: draft.packingPlan.cutleryRequested,
    separateBags: false,
    bagCount: 1,
    allocations: [],
  };
}

function basketProblem(draft: WhatsAppDraft, catalogue: WhatsAppCatalogue): string | null {
  if (!draft.picks.length) return "Add at least one dish before reviewing your order.";
  if (launchPickCount(draft.picks) > MAX_LAUNCH_PICKS)
    return "Keep this order to 60 items or fewer.";
  for (const pick of draft.picks) {
    const problem = validatePick(pick, catalogue);
    if (problem) return problem;
  }
  return null;
}

function packingProblem(draft: WhatsAppDraft): string | null {
  const packing = draft.packingPlan;
  if (!packing.separateBags)
    return packing.bagCount === 1 && packing.allocations.length === 0
      ? null
      : "Review the packing choices.";
  const seen = new Set<string>();
  for (const allocation of packing.allocations) {
    const index = Number(allocation.lineId.slice(5)) - 1;
    const key = `${allocation.lineId}:${allocation.bag}`;
    if (!draft.picks[index] || allocation.bag > packing.bagCount || seen.has(key))
      return "Assign every item to its numbered bag exactly once.";
    seen.add(key);
  }
  if (
    draft.picks.some(
      (pick, index) =>
        packing.allocations
          .filter((entry) => entry.lineId === `line-${index + 1}`)
          .reduce((sum, entry) => sum + entry.quantity, 0) !== pick.quantity,
    )
  )
    return "Assign the full quantity of every item to your bags.";
  for (let bag = 1; bag <= packing.bagCount; bag++)
    if (!packing.allocations.some((entry) => entry.bag === bag))
      return `Bag ${bag} is empty. Review the number of bags.`;
  return null;
}

function pendingPackingLine(draft: WhatsAppDraft) {
  return draft.picks.findIndex(
    (pick, index) =>
      draft.packingPlan.allocations
        .filter((entry) => entry.lineId === `line-${index + 1}`)
        .reduce((sum, entry) => sum + entry.quantity, 0) < pick.quantity,
  );
}

function reviewText(
  draft: WhatsAppDraft,
  catalogue: WhatsAppCatalogue,
  context: WhatsAppConversationContext,
) {
  const estimate = launchMenuBasketDisplayPrice(draft.picks, catalogue.brands).itemsSubtotalPence;
  const packing = draft.packingPlan;
  const bags = packing.separateBags
    ? Array.from({ length: packing.bagCount }, (_, index) => {
        const allocations = packing.allocations.filter((entry) => entry.bag === index + 1);
        return `Bag ${index + 1}: ${allocations
          .map((entry) => `${entry.quantity} × item ${entry.lineId.slice(5)}`)
          .join(", ")}`;
      })
    : ["Pack together"];
  const vehicle = draft.vehicle;
  return [
    "Please check your order before confirmation and payment.",
    `MealDeck Luton · ${draft.fulfilment === "curbside" ? "Kerbside" : "Pickup"}`,
    ...(Number.isInteger(context.estimateMinutes) &&
    context.estimateMinutes! > 0 &&
    context.estimateMinutes! <= 360
      ? [`Current preparation estimate: ${context.estimateMinutes} minutes after acceptance.`]
      : []),
    `Name: ${draft.customer.name}`,
    `Contact: ${draft.customer.phone}`, // Current private conversation only.
    ...(draft.fulfilment === "curbside" && vehicle
      ? [
          `Vehicle: ${vehicle.colour} ${vehicle.make} · registration ending ${vehicle.registrationLast4}`,
        ]
      : []),
    "",
    ...draft.picks.map((pick, index) => pickDescription(pick, index, catalogue)),
    "",
    ...bags,
    `Cutlery: ${packing.cutleryRequested ? "Requested" : "Not requested"}`,
    ...(draft.notes ? [`Special requests: ${draft.notes}`] : []),
    `Menu subtotal estimate: ${formatLaunchMenuPrice(estimate)} before offers and final charges.`,
    "The secure checkout confirms availability, eligible offers and the final total before you pay.",
    ...(context.guestEligible
      ? []
      : ["The secure checkout will apply the current member/sign-in requirements."]),
    "Nothing has been paid or accepted yet.",
  ].join("\n");
}

function prompt(
  draft: WhatsAppDraft,
  catalogue: WhatsAppCatalogue | null,
  context: WhatsAppConversationContext,
): WhatsAppReply[] {
  switch (draft.stage) {
    case "fulfilment":
      return choices(
        draft,
        "Welcome to MealDeck Luton. I’m the automated ordering assistant; you can ask for staff at any time. " +
          (!context.available
            ? "The kitchen is not accepting new orders right now, but you can browse. "
            : "") +
          "Would you like pickup or kerbside?",
        [
          { verb: "fulfilment", value: "pickup", title: "Pickup" },
          { verb: "fulfilment", value: "curbside", title: "Kerbside" },
          { verb: "help", title: "Speak to staff" },
        ],
      );
    case "name":
      return [{ text: "What name should we put on your order?" }];
    case "phone":
      return [
        {
          text: "What WhatsApp/contact number should we use for this order? Include the country code, for example +44. This does not register you for offers.",
        },
      ];
    case "vehicle_make":
      return [{ text: "What is your car make? For example, Toyota." }];
    case "vehicle_colour":
      return [{ text: "What colour is your car?" }];
    case "vehicle_registration":
      return [
        {
          text: "What are the last four characters of your registration? Letters and digits are allowed; please send only those four characters.",
        },
      ];
    case "consent":
      return choices(
        draft,
        "May we send updates about this order here on WhatsApp? Promotional offers stay off.",
        [
          { verb: "updates", value: "yes", title: "Yes, order updates" },
          { verb: "updates", value: "no", title: "No updates" },
        ],
      );
    case "menu": {
      if (!catalogue?.brands.length)
        return [
          {
            text: "The live menu is unavailable at the moment. Please try again shortly or ask for staff. I cannot confirm items or prices until it returns.",
          },
        ];
      const brand = catalogue.brands.find((entry) => entry.id === draft.selectedBrandId);
      if (!brand)
        return choices(
          draft,
          "Choose a brand, or tell me what you would like. You can mix brands in one basket.",
          [
            ...catalogue.brands.map((entry) => ({
              verb: "brand",
              value: entry.id,
              title: entry.name,
            })),
            ...(draft.picks.length
              ? [
                  { verb: "basket", title: "View basket" },
                  { verb: "review", title: "Review order" },
                ]
              : []),
          ],
          draft.menuPage,
        );
      return choices(
        draft,
        `${label(brand.name)} — choose a dish. Shown prices are menu estimates; checkout confirms the total.`,
        [
          ...brand.sections.flatMap((section) =>
            section.items.map((item) => ({
              verb: "item",
              value: item.id,
              title: item.name,
              description: `${section.title} · ${item.priceVariants ? "From " : ""}${formatLaunchMenuPrice(item.pricePence)}`,
            })),
          ),
          { verb: "brands", title: "Other brands" },
          ...(draft.picks.length
            ? [
                { verb: "basket", title: "View basket" },
                { verb: "review", title: "Review order" },
              ]
            : []),
        ],
        draft.menuPage,
      );
    }
    case "options": {
      if (!catalogue || !draft.editing)
        return [{ text: "Please reopen the live menu to choose your dish." }];
      const found = liveItem(catalogue, draft.editing.brandId, draft.editing.itemId);
      if (!found)
        return [
          {
            text: "This dish is unavailable. Your saved basket has not been changed. Type menu to choose another dish.",
          },
        ];
      const group = nextGroup(draft, catalogue);
      if (!group) {
        draft.stage = "extras";
        draft.menuPage = 0;
        return prompt(draft, catalogue, context);
      }
      const options = availableGroupOptions(group, found.item);
      if (!options.length && group.required) {
        const replacement = liveCrossOffers(draft, catalogue).find(
          (offer) => offer.mode === "upgrade" && offer.slot === group.replacedBy?.crossSlot,
        );
        if (replacement) {
          draft.editing.crossSlot = replacement.slot;
          draft.stage = "cross";
          draft.menuPage = 0;
          return [
            {
              text: `${label(group.label)} is unavailable. You can choose a currently available replacement or cancel this dish.`,
            },
            ...prompt(draft, catalogue, context),
          ];
        }
        return [
          {
            text: `The required ${label(group.label)} choice is unavailable. Your saved basket has not changed. Type menu to choose another dish.`,
          },
        ];
      }
      const chosen = draft.editing.selections[group.id] ?? [];
      return choices(
        draft,
        `${label(found.item.name)}: ${label(group.label)}${group.required ? " (required)" : " (optional)"}. ` +
          (group.kind === "multiple"
            ? "Choose any extras, then tap Done choices."
            : "Choose one option."),
        [
          ...options.map((option) => ({
            verb: "option",
            value: option.id,
            title: `${chosen.includes(option.id) ? "✓ " : ""}${option.label}`,
            description: option.pricePence
              ? `+${formatLaunchMenuPrice(option.pricePence)} each`
              : "Included / no additional charge",
          })),
          ...(!group.required && chosen.length
            ? [{ verb: "options_clear", title: "Clear these choices" }]
            : []),
          ...(!group.required || chosen.length
            ? [{ verb: "options_done", title: "Done choices" }]
            : []),
          { verb: "cancel_item", title: "Cancel this dish" },
        ],
        draft.menuPage,
      );
    }
    case "extras": {
      if (!catalogue || !draft.editing) return [{ text: "Please reopen the live menu." }];
      const offers = liveCrossOffers(draft, catalogue);
      if (!offers.length) {
        draft.stage = "quantity";
        return prompt(draft, catalogue, context);
      }
      return choices(
        draft,
        "Would you like a named extra or meal replacement? Your choices apply to each item.",
        [
          ...offers.map((offer) => ({
            verb: "cross_slot",
            value: offer.slot,
            title: offer.title,
            description:
              offer.mode === "upgrade"
                ? "Replace the included component"
                : "Add alongside this dish",
          })),
          { verb: "extras_done", title: "Done extras" },
          { verb: "cancel_item", title: "Cancel this dish" },
        ],
      );
    }
    case "cross": {
      if (!catalogue || !draft.editing) return [{ text: "Please reopen the live menu." }];
      const offer = liveCrossOffers(draft, catalogue).find(
        (entry) => entry.slot === draft.editing!.crossSlot,
      );
      if (!offer) {
        draft.stage = "options";
        return prompt(draft, catalogue, context);
      }
      return choices(
        draft,
        label(offer.description, 500) +
          (offer.mode === "upgrade"
            ? " This replaces your existing choice for that meal component."
            : ""),
        [
          ...offer.choices.map((choice) => ({
            verb: "cross_item",
            value: choice.itemId,
            title: choice.name,
            description: `+${formatLaunchMenuPrice(choice.pricePence)} each`,
          })),
          { verb: "cross_remove", title: "No replacement/extra" },
          { verb: "cancel_item", title: "Cancel this dish" },
        ],
        draft.menuPage,
      );
    }
    case "quantity":
      return [
        {
          text: "How many of this exact dish and its chosen extras would you like? Send a number from 1 to 20.",
        },
      ];
    case "item_review": {
      if (!catalogue || !draft.editing) return [{ text: "Please reopen the live menu." }];
      const temporary: LaunchMenuPick = { key: "review", ...draft.editing };
      return [
        ...textReplies(pickDescription(temporary, 0, catalogue)),
        ...choices(draft, "Check every flavour and extra. Is this dish correct?", [
          {
            verb: "save_item",
            title: draft.editing.editingIndex === null ? "Add to basket" : "Save changes",
          },
          { verb: "edit_choices", title: "Change choices" },
          { verb: "cancel_item", title: "Cancel" },
        ]),
      ];
    }
    case "cutlery":
      return choices(draft, "Would you like cutlery?", [
        { verb: "cutlery", value: "yes", title: "Include cutlery" },
        { verb: "cutlery", value: "no", title: "No cutlery" },
      ]);
    case "packing_count":
      return choices(
        draft,
        "How should we pack your food? Attached extras stay with their main item.",
        [
          { verb: "bags", value: 1, title: "Pack together" },
          { verb: "bags", value: 2, title: "2 numbered bags" },
          { verb: "bags", value: 3, title: "3 numbered bags" },
        ],
      );
    case "packing_allocations": {
      const index = pendingPackingLine(draft);
      if (index < 0) {
        const problem = packingProblem(draft);
        if (problem) {
          resetPacking(draft);
          draft.stage = "packing_count";
          return [{ text: problem }, ...prompt(draft, catalogue, context)];
        }
        draft.stage = "notes";
        return prompt(draft, catalogue, context);
      }
      const pick = draft.picks[index]!;
      const assigned = draft.packingPlan.allocations
        .filter((entry) => entry.lineId === `line-${index + 1}`)
        .reduce((sum, entry) => sum + entry.quantity, 0);
      const item = catalogue && liveItem(catalogue, pick.brandId, pick.itemId);
      return choices(
        draft,
        `Item ${index + 1}: ${item ? label(item.item.name) : "selected dish"}, unit ${assigned + 1} of ${pick.quantity}. Which bag? ` +
          "To put all remaining units of this line together, type “all to bag 1” (or 2/3).",
        Array.from({ length: draft.packingPlan.bagCount }, (_, bag) => ({
          verb: "allocate",
          value: bag + 1,
          title: `Bag ${bag + 1}`,
        })),
      );
    }
    case "notes":
      return [
        {
          text: "Any special requests for the kitchen? Send them in one message, or type none. Requests are subject to kitchen confirmation. Tell us about an allergy so a staff member can help before payment.",
        },
      ];
    case "review":
      return catalogue
        ? [
            ...textReplies(reviewText(draft, catalogue, context)),
            ...choices(draft, "Are the items, packing and collection details correct?", [
              { verb: "confirm_review", title: "Secure review & pay" },
              { verb: "basket", title: "Edit basket" },
              { verb: "details", title: "Edit pickup details" },
            ]),
          ]
        : [{ text: "We cannot check the current menu. Please try again before payment." }];
    case "checkout": {
      const text =
        "Your basket is locked for secure checkout. Use the MealDeck review link to check the final total and pay. " +
        "This chat cannot confirm payment; please use your private order confirmation or type help for staff assistance.";
      return context.canStartNewOrder === true
        ? choices(
            draft,
            text +
              " To discard this unpaid basket or start again after a completed order, choose New order. The previous unpaid link will stop working.",
            [{ verb: "new_order", title: "New order" }],
          )
        : [{ text }];
    }
    case "handoff":
      return [
        {
          text: "This conversation needs a staff member. Automated ordering is paused; a request has been recorded for the team.",
        },
      ];
  }
}

function handoff(draft: WhatsAppDraft, reason: string, text: string): WhatsAppConversationResult {
  draft.handoffReason = reason;
  draft.stage = "handoff";
  return { draft, replies: [{ text }], requestCheckout: false, handoffReason: reason };
}

function beginItem(
  draft: WhatsAppDraft,
  catalogue: WhatsAppCatalogue,
  itemBrand: string,
  itemId: string,
  editingIndex: number | null = null,
): boolean {
  const found = liveItem(catalogue, itemBrand, itemId);
  if (!found) return false;
  const saved = editingIndex === null ? undefined : draft.picks[editingIndex];
  draft.editing = {
    brandId: found.brand.id,
    itemId,
    quantity: saved?.quantity ?? 1,
    selections: structuredClone(saved?.selections ?? {}),
    crossSelections: structuredClone(saved?.crossSelections ?? []),
    editingIndex,
    answeredGroups: [],
    crossSlot: null,
  };
  draft.stage = "options";
  draft.menuPage = 0;
  return true;
}

function showBasket(
  draft: WhatsAppDraft,
  catalogue: WhatsAppCatalogue,
  context: WhatsAppConversationContext,
): WhatsAppReply[] {
  draft.stage = "menu";
  draft.selectedBrandId = null;
  draft.menuPage = 0;
  draft.editing = null;
  if (!draft.picks.length)
    return [{ text: "Your basket is empty." }, ...prompt(draft, catalogue, context)];
  return [
    ...textReplies(
      draft.picks.map((pick, index) => pickDescription(pick, index, catalogue)).join("\n\n"),
    ),
    {
      text: "To change a line, type edit 1, remove 1, or quantity 1 2 (line 1, quantity 2). Every change will be reviewed again before payment.",
    },
    ...choices(draft, "What would you like to do next?", [
      { verb: "brands", title: "Add more food" },
      { verb: "review", title: "Review order" },
    ]),
  ];
}

function detailsStage(draft: WhatsAppDraft): WhatsAppDraft["stage"] {
  if (!draft.customer.name) return "name";
  if (!draft.customer.phone) return "phone";
  if (draft.fulfilment === "curbside") {
    if (!draft.vehicle?.make) return "vehicle_make";
    if (!draft.vehicle.colour) return "vehicle_colour";
    if (!draft.vehicle.registrationLast4) return "vehicle_registration";
  }
  return "consent";
}

function semanticProposal(proposal: WhatsAppProposal): boolean {
  const keys: Record<WhatsAppProposal["intent"], string[]> = {
    browse_menu: ["brandId"],
    select_item: ["brandId", "itemId"],
    add_item: ["brandId", "itemId", "quantity", "selections", "crossSelections"],
    edit_item: ["lineNumber"],
    remove_item: ["lineNumber"],
    set_quantity: ["lineNumber", "quantity"],
    review: [],
    help: [],
    unknown: [],
  };
  return Object.entries(proposal).every(
    ([key, value]) => key === "intent" || value === null || keys[proposal.intent].includes(key),
  );
}

/** No network calls or privileged operations. Every reply uses controlled text. */
export function advanceWhatsAppConversation(
  previous: WhatsAppDraft,
  input: WhatsAppConversationInput,
  menu: MealDeckPublicMenuSnapshot | null,
  context: WhatsAppConversationContext,
): WhatsAppConversationResult {
  const parsed = parseWhatsAppDraft(previous);
  if (!parsed)
    return handoff(
      createWhatsAppDraft(),
      "invalid_session",
      "We could not safely restore this conversation. Please ask the MealDeck team for help.",
    );
  const draft = structuredClone(parsed);
  if (draft.revision === 2_147_483_647)
    return handoff(
      draft,
      "session_limit",
      "This conversation needs to be refreshed by the MealDeck team.",
    );
  draft.revision++;
  const catalogue = normaliseWhatsAppCatalogue(menu);
  const respond = (replies?: WhatsAppReply[]): WhatsAppConversationResult => {
    const output = replies ?? prompt(draft, catalogue, context);
    if (output.length > 20) {
      // Never send a partial review followed by a confirmation button.
      draft.stage = "menu";
      draft.selectedBrandId = null;
      draft.menuPage = 0;
      return {
        draft,
        replies: [
          {
            text: "This basket is too detailed to show safely in one review. Remove an item with “remove 1” (using its line number), or type help for staff, then review again. Checkout has not started.",
          },
        ],
        requestCheckout: false,
      };
    }
    return { draft, replies: output, requestCheckout: false };
  };
  if (
    !input ||
    typeof input.text !== "string" ||
    input.text.length > 4_000 ||
    (input.actionId !== undefined &&
      (typeof input.actionId !== "string" || input.actionId.length > 240))
  )
    return respond([{ text: "Please send one short message or choose a current menu option." }]);
  const text = input.text.normalize("NFC").trim();
  const folded = text.toLocaleLowerCase("en-GB");
  if (/^(?:stop|unsubscribe|stop all|stop messages)$/i.test(text)) {
    draft.orderUpdatesConsent = false;
    draft.marketingConsent = false;
    return respond([
      {
        text: "WhatsApp updates and offers are switched off. You can still follow an existing order through its private MealDeck confirmation page.",
      },
    ]);
  }
  if (/^(?:offers off|stop offers)$/i.test(text)) {
    draft.marketingConsent = false;
    return respond([
      {
        text: "Promotional WhatsApp offers are switched off. Your order-update choice is unchanged.",
      },
    ]);
  }
  if (/^(?:offers on|subscribe to offers)$/i.test(text)) {
    draft.marketingConsent = true;
    return respond([
      {
        text: "You have opted in to MealDeck promotional offers on WhatsApp. Reply STOP OFFERS to unsubscribe. Your order is unchanged.",
      },
    ]);
  }
  const allergy =
    !/^no (?:food )?allerg(?:y|ies)[.!]?$/i.test(text) &&
    /\b(?:allerg(?:y|ies|ic|en|ens)|anaphyla\w*|coeliac|celiac|intoleran\w*|(?:nut|peanut|gluten|dairy|egg|milk)[ -]free|no nuts|cross[ -]contamin\w*)\b|الرجی|حساسية/iu.test(
      text,
    );
  if (allergy)
    return handoff(
      draft,
      "allergen",
      "A staff member must check allergy suitability and kitchen cross-contact before payment. Automated ordering is paused; I cannot promise a dish is allergen-free.",
    );
  if (
    /\b(?:refund\w*|chargeback|disput\w*|charged twice|double charged|double charge)\b/i.test(text)
  )
    return handoff(
      draft,
      "payment_review",
      "A staff member needs to review this payment request. I have not issued a refund or changed any payment.",
    );
  if (/^(?:help|human|staff|agent|speak to (?:a person|staff|someone))$/i.test(text))
    return handoff(
      draft,
      "customer_request",
      "Your request for a staff member has been recorded. Automated ordering is paused.",
    );
  if (draft.stage === "handoff" || draft.handoffReason) return respond();
  if (draft.checkoutLocked || draft.stage === "checkout") {
    if (
      context.canStartNewOrder === true &&
      (/^new order$/i.test(text) || input.actionId === actionId(previous, "new_order"))
    ) {
      const revision = draft.revision;
      Object.assign(draft, createWhatsAppDraft(), { revision });
      return respond();
    }
    draft.checkoutLocked = true;
    draft.stage = "checkout";
    return respond();
  }
  if (/\b(?:delivery|deliver to|group order|split payment|split the bill)\b/i.test(text))
    return respond([
      {
        text: "WhatsApp ordering currently supports one Luton pickup or kerbside basket. Group ordering and delivery will be added later. Your current basket is unchanged.",
      },
    ]);
  if (!safePlainText(text.replace(/[\n\t\r]/g, "")))
    return respond([
      { text: "Please use plain text without hidden formatting or control characters." },
    ]);

  let command: { verb: string; value?: string } | null = null;
  if (input.actionId) {
    const match = /^mdw:(0|[1-9]\d{0,9}):([a-z_]{1,24})(?::([a-z0-9-]{1,180}))?$/.exec(
      input.actionId,
    );
    if (!match || Number(match[1]) !== previous.revision)
      return respond([
        { text: "That menu choice has expired. Please use the latest options below." },
        ...prompt(draft, catalogue, context),
      ]);
    command = { verb: match[2]!, ...(match[3] ? { value: match[3] } : {}) };
  }
  if (command?.verb === "help")
    return handoff(
      draft,
      "customer_request",
      "Your request for a staff member has been recorded. Automated ordering is paused.",
    );

  if (!command) {
    if (/^(?:menu|browse|start|hello|hi|hey)$/i.test(text)) {
      if (
        [
          "menu",
          "options",
          "extras",
          "cross",
          "quantity",
          "item_review",
          "cutlery",
          "packing_count",
          "packing_allocations",
          "notes",
          "review",
        ].includes(draft.stage)
      )
        command = { verb: "brands" };
      else return respond();
    } else if (/^(?:basket|cart|view basket)$/i.test(text)) command = { verb: "basket" };
    else if (/^(?:review|checkout|pay)$/i.test(text)) command = { verb: "review" };
    else if (/^(?:pickup|collection|kerbside|curbside)$/i.test(text))
      command = {
        verb: "fulfilment",
        value: /^(?:kerbside|curbside)$/i.test(text) ? "curbside" : "pickup",
      };
    else {
      const edit = /^(edit|remove) ([1-9]|[1-5][0-9]|60)$/i.exec(text);
      const quantity = /^quantity ([1-9]|[1-5][0-9]|60) (0|[1-9]|1\d|20)$/i.exec(text);
      if (edit) command = { verb: edit[1]!.toLowerCase(), value: edit[2]! };
      else if (quantity)
        command = { verb: "line_quantity", value: `${quantity[1]}-${quantity[2]}` };
    }
  }

  if (command?.verb === "page") {
    if (
      !catalogue ||
      !["menu", "options", "cross"].includes(draft.stage) ||
      !/^(0|[1-9]\d?)$/.test(command.value ?? "")
    )
      return respond([{ text: "Please use a current menu choice." }]);
    draft.menuPage = Number(command.value);
    return respond();
  }
  if (command?.verb === "fulfilment" && ["pickup", "curbside"].includes(command.value ?? "")) {
    draft.fulfilment = command.value as "pickup" | "curbside";
    draft.vehicle =
      draft.fulfilment === "curbside"
        ? (draft.vehicle ?? { make: "", colour: "", registrationLast4: "" })
        : null;
    draft.editing = null;
    draft.menuPage = 0;
    draft.stage = detailsStage(draft);
    return respond();
  }
  if (command?.verb === "details") {
    draft.customer = { name: "", phone: "" };
    draft.vehicle = null;
    draft.stage = "fulfilment";
    return respond();
  }
  // Details are collected from the customer's message, never inferred by a model.
  if (
    ["name", "phone", "vehicle_make", "vehicle_colour", "vehicle_registration", "consent"].includes(
      draft.stage,
    )
  ) {
    if (draft.stage === "name" && !command) {
      const name = safePlainText(text) && !/^\d+$/.test(text) ? normalizeCustomerName(text) : null;
      if (!name)
        return respond([{ text: "Please send a name of up to 120 plain-text characters." }]);
      draft.customer.name = name;
      draft.stage = "phone";
      return respond();
    }
    if (draft.stage === "phone" && !command) {
      const phone = normalizeCustomerPhone(text);
      if (!phone)
        return respond([
          {
            text: "Please send a valid contact number including its country code, or a UK mobile number starting 07.",
          },
        ]);
      draft.customer.phone = phone;
      draft.stage = detailsStage(draft);
      return respond();
    }
    if ((draft.stage === "vehicle_make" || draft.stage === "vehicle_colour") && !command) {
      const maximum = draft.stage === "vehicle_make" ? 60 : 40;
      if (!safePlainText(text) || text.length < 2 || text.length > maximum)
        return respond([
          {
            text: `Please send the ${draft.stage === "vehicle_make" ? "car make" : "car colour"} using 2–${maximum} plain-text characters.`,
          },
        ]);
      draft.vehicle ??= { make: "", colour: "", registrationLast4: "" };
      if (draft.stage === "vehicle_make") draft.vehicle.make = text;
      else draft.vehicle.colour = text;
      draft.stage = detailsStage(draft);
      return respond();
    }
    if (draft.stage === "vehicle_registration" && !command) {
      if (!/^[a-z0-9]{4}$/i.test(text))
        return respond([
          {
            text: "Send exactly the last four registration characters, such as 2CDE. Please do not send the full registration.",
          },
        ]);
      draft.vehicle!.registrationLast4 = text.toUpperCase();
      draft.stage = "consent";
      return respond();
    }
    if (draft.stage === "consent") {
      const answer =
        command?.verb === "updates"
          ? command.value
          : /^(?:yes|yes please|ok)$/i.test(text)
            ? "yes"
            : /^(?:no|no thanks)$/i.test(text)
              ? "no"
              : null;
      if (answer === "yes" || answer === "no") {
        draft.orderUpdatesConsent = answer === "yes";
        draft.stage = "menu";
        return respond();
      }
    }
    return respond();
  }
  if (draft.stage === "fulfilment") return respond();
  if (!catalogue)
    return respond([
      {
        text: "The live menu is temporarily unavailable. Your basket is saved, but it cannot be checked out until we can verify the current choices.",
      },
    ]);

  // Model proposals are optional. They never receive confirmation/payment powers.
  if (!command && input.proposal !== undefined && ["menu", "review"].includes(draft.stage)) {
    const parsedProposal = whatsAppProposalSchema.safeParse(input.proposal);
    if (!parsedProposal.success || !semanticProposal(parsedProposal.data))
      return respond([
        {
          text: "I could not safely match that request. Please choose from the live menu or use the basket commands.",
        },
        ...prompt(draft, catalogue, context),
      ]);
    const proposal = parsedProposal.data;
    if (proposal.intent === "help")
      return handoff(
        draft,
        "customer_request",
        "Your request for staff help has been recorded. Automated ordering is paused.",
      );
    if (proposal.intent === "browse_menu")
      command = proposal.brandId ? { verb: "brand", value: proposal.brandId } : { verb: "brands" };
    if (proposal.intent === "review") command = { verb: "review" };
    if (proposal.intent === "edit_item" && proposal.lineNumber)
      command = { verb: "edit", value: String(proposal.lineNumber) };
    if (proposal.intent === "remove_item" && proposal.lineNumber)
      command = { verb: "remove", value: String(proposal.lineNumber) };
    if (proposal.intent === "set_quantity" && proposal.lineNumber && proposal.quantity !== null)
      command = { verb: "line_quantity", value: `${proposal.lineNumber}-${proposal.quantity}` };
    if (proposal.intent === "select_item" && proposal.brandId && proposal.itemId) {
      if (!beginItem(draft, catalogue, proposal.brandId, proposal.itemId))
        return respond([{ text: "That dish is unavailable. Please choose a current menu item." }]);
      return respond();
    }
    if (
      proposal.intent === "add_item" &&
      proposal.brandId &&
      proposal.itemId &&
      proposal.quantity &&
      proposal.selections
    ) {
      if (
        new Set(proposal.selections.map((entry) => entry.groupId)).size !==
        proposal.selections.length
      )
        return respond([
          { text: "Please choose each option group once. Your basket has not changed." },
        ]);
      const candidate = {
        brandId: proposal.brandId,
        itemId: proposal.itemId,
        quantity: proposal.quantity,
        selections: Object.fromEntries(
          proposal.selections.map((entry) => [entry.groupId, entry.optionIds]),
        ),
        crossSelections: proposal.crossSelections ?? [],
      };
      const problem = validatePick(candidate, catalogue);
      if (problem)
        return respond([
          { text: problem + " Your basket has not changed." },
          ...prompt(draft, catalogue, context),
        ]);
      beginItem(draft, catalogue, candidate.brandId, candidate.itemId);
      draft.editing = { ...draft.editing!, ...candidate };
      draft.stage = "item_review";
      return respond();
    }
  }

  if (command?.verb === "brands") {
    draft.stage = "menu";
    draft.selectedBrandId = null;
    draft.menuPage = 0;
    draft.editing = null;
    return respond();
  }
  if (command?.verb === "brand") {
    const brand = catalogue.brands.find((entry) => entry.id === command.value);
    if (!brand)
      return respond([{ text: "That brand is unavailable. Please choose a current menu." }]);
    draft.stage = "menu";
    draft.selectedBrandId = brand.id;
    draft.menuPage = 0;
    draft.editing = null;
    return respond();
  }
  if (command?.verb === "item" && draft.stage === "menu" && draft.selectedBrandId) {
    if (!beginItem(draft, catalogue, draft.selectedBrandId, command.value ?? ""))
      return respond([{ text: "That item is unavailable. Please choose a current menu item." }]);
    return respond();
  }
  if (command?.verb === "basket") return respond(showBasket(draft, catalogue, context));
  if (command && ["edit", "remove", "line_quantity"].includes(command.verb)) {
    const match = /^(\d{1,2})(?:-(\d{1,2}))?$/.exec(command.value ?? "");
    const index = match ? Number(match[1]) - 1 : -1;
    const pick = draft.picks[index];
    if (!pick) return respond([{ text: "Please use the line number from your current basket." }]);
    if (command.verb === "edit") {
      if (!beginItem(draft, catalogue, pick.brandId, pick.itemId, index))
        return respond([
          { text: "That item is no longer available. Remove it or choose another dish." },
        ]);
      return respond();
    }
    const quantity = command.verb === "remove" ? 0 : Number(match?.[2]);
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 20)
      return respond([
        { text: "Use quantity followed by the line number and a quantity from 0 to 20." },
      ]);
    const next = setLaunchPickQuantity(draft.picks, pick.key, quantity);
    if (next === draft.picks && quantity !== pick.quantity)
      return respond([{ text: "That change exceeds the basket limit. Your basket is unchanged." }]);
    draft.picks = next;
    resetPacking(draft);
    return respond(showBasket(draft, catalogue, context));
  }
  if (command?.verb === "cancel_item" && draft.editing) {
    draft.editing = null;
    draft.stage = "menu";
    draft.menuPage = 0;
    return respond([
      { text: "The unfinished dish was cancelled. Your saved basket is unchanged." },
      ...prompt(draft, catalogue, context),
    ]);
  }
  if (command?.verb === "edit_choices" && draft.stage === "item_review" && draft.editing) {
    draft.editing.answeredGroups = [];
    draft.stage = "options";
    draft.menuPage = 0;
    return respond();
  }
  if (draft.stage === "options" && draft.editing) {
    const found = liveItem(catalogue, draft.editing.brandId, draft.editing.itemId);
    const group = nextGroup(draft, catalogue);
    if (!found || !group) return respond();
    const options = availableGroupOptions(group, found.item);
    if (command?.verb === "options_clear" && !group.required) {
      const requested = { ...draft.editing.selections, [group.id]: [] };
      const priorCross = draft.editing.crossSelections;
      const clean = cleanLaunchCrossConfiguration(found.brand, found.item, requested, priorCross);
      const dependenciesChanged =
        comparableSelections(requested) !== comparableSelections(clean.selections) ||
        comparableCross(priorCross) !== comparableCross(clean.crossSelections);
      draft.editing.selections = clean.selections;
      draft.editing.crossSelections = clean.crossSelections;
      if (!draft.editing.answeredGroups.includes(group.id))
        draft.editing.answeredGroups.push(group.id);
      draft.menuPage = 0;
      return respond([
        ...(dependenciesChanged
          ? [
              {
                text: "Removing that meal option also removes its dependent meal choices and replacements. Please review the remaining extras before saving.",
              },
            ]
          : []),
        ...prompt(draft, catalogue, context),
      ]);
    }
    const optionId =
      command?.verb === "option"
        ? command.value
        : options.find((entry) => label(entry.label).toLocaleLowerCase("en-GB") === folded)?.id;
    if (optionId && options.some((entry) => entry.id === optionId)) {
      const prior = draft.editing.selections[group.id] ?? [];
      const selected =
        group.kind === "single"
          ? [optionId]
          : prior.includes(optionId)
            ? prior.filter((id) => id !== optionId)
            : [...prior, optionId];
      const priorCross = draft.editing.crossSelections;
      const clean = cleanLaunchCrossConfiguration(
        found.brand,
        found.item,
        { ...draft.editing.selections, [group.id]: selected },
        draft.editing.crossSelections,
      );
      draft.editing.selections = clean.selections;
      draft.editing.crossSelections = clean.crossSelections;
      if (group.kind === "single" && !draft.editing.answeredGroups.includes(group.id))
        draft.editing.answeredGroups.push(group.id);
      draft.menuPage = 0;
      return respond([
        ...(comparableCross(priorCross) !== comparableCross(clean.crossSelections)
          ? [
              {
                text: "That change replaces an earlier meal extra. Please review the named extras again before saving this dish.",
              },
            ]
          : []),
        ...prompt(draft, catalogue, context),
      ]);
    }
    if (command?.verb === "options_done" || /^(?:done|none|no|no thanks|skip)$/i.test(text)) {
      if (group.required && !draft.editing.selections[group.id]?.length)
        return respond([
          { text: "This choice is required. Please select an available option." },
          ...prompt(draft, catalogue, context),
        ]);
      if (!draft.editing.answeredGroups.includes(group.id))
        draft.editing.answeredGroups.push(group.id);
      draft.menuPage = 0;
      return respond();
    }
    return respond();
  }
  if (draft.stage === "extras" && draft.editing) {
    if (command?.verb === "cross_slot" && ["side", "drink"].includes(command.value ?? "")) {
      draft.editing.crossSlot = command.value as "side" | "drink";
      draft.stage = "cross";
      draft.menuPage = 0;
      return respond();
    }
    if (command?.verb === "extras_done" || /^(?:done|none|no|no thanks)$/i.test(text)) {
      const problem = validatePick(draft.editing, catalogue);
      if (problem) {
        draft.stage = "options";
        return respond([{ text: problem }, ...prompt(draft, catalogue, context)]);
      }
      draft.stage = "quantity";
      return respond();
    }
    return respond();
  }
  if (draft.stage === "cross" && draft.editing) {
    const found = liveItem(catalogue, draft.editing.brandId, draft.editing.itemId);
    const offer = liveCrossOffers(draft, catalogue).find(
      (entry) => entry.slot === draft.editing!.crossSlot,
    );
    if (!found || !offer) return respond();
    const selected =
      command?.verb === "cross_item"
        ? command.value
        : offer.choices.find((entry) => label(entry.name).toLocaleLowerCase("en-GB") === folded)
            ?.itemId;
    if (
      command?.verb === "cross_remove" ||
      (selected && offer.choices.some((entry) => entry.itemId === selected))
    ) {
      const clean = setLaunchCrossChoice(
        found.brand,
        found.item,
        draft.editing.selections,
        draft.editing.crossSelections,
        offer.id,
        command?.verb === "cross_remove" ? null : selected!,
      );
      draft.editing.selections = clean.selections;
      draft.editing.crossSelections = clean.crossSelections;
      draft.editing.crossSlot = null;
      draft.stage = nextGroup(draft, catalogue) ? "options" : "extras";
      draft.menuPage = 0;
      return respond();
    }
    return respond();
  }
  if (draft.stage === "quantity" && draft.editing && !command) {
    if (!/^(?:[1-9]|1\d|20)$/.test(text)) return respond();
    draft.editing.quantity = Number(text);
    draft.stage = "item_review";
    return respond();
  }
  if (command?.verb === "save_item" && draft.stage === "item_review" && draft.editing) {
    const editing = draft.editing;
    const problem = validatePick(editing, catalogue);
    if (problem) return respond([{ text: problem + " Your saved basket has not changed." }]);
    const next =
      editing.editingIndex === null
        ? addLaunchPick(
            draft.picks,
            editing.brandId,
            editing.itemId,
            editing.selections,
            editing.quantity,
            editing.crossSelections,
          )
        : draft.picks[editing.editingIndex]
          ? updateLaunchPick(
              draft.picks,
              draft.picks[editing.editingIndex]!.key,
              editing.selections,
              editing.quantity,
              editing.crossSelections,
            )
          : draft.picks;
    if (next === draft.picks)
      return respond([
        {
          text: "That dish could not be saved within the basket limits. Your basket is unchanged.",
        },
      ]);
    draft.picks = next;
    draft.editing = null;
    resetPacking(draft);
    return respond(showBasket(draft, catalogue, context));
  }
  if (command?.verb === "review") {
    const problem = basketProblem(draft, catalogue);
    if (problem) return respond([{ text: problem }, ...prompt(draft, catalogue, context)]);
    draft.editing = null;
    if (draft.stage !== "review") draft.stage = "cutlery";
    return respond();
  }
  if (draft.stage === "cutlery") {
    const answer =
      command?.verb === "cutlery"
        ? command.value
        : /^(?:yes|yes please)$/i.test(text)
          ? "yes"
          : /^(?:no|no thanks)$/i.test(text)
            ? "no"
            : null;
    if (answer === "yes" || answer === "no") {
      draft.packingPlan.cutleryRequested = answer === "yes";
      draft.stage = "packing_count";
      return respond();
    }
  }
  if (draft.stage === "packing_count") {
    const value =
      command?.verb === "bags"
        ? command.value
        : /^(?:together|pack together)$/i.test(text)
          ? "1"
          : /^[123]$/.test(text)
            ? text
            : null;
    if (value && /^[123]$/.test(value)) {
      const count = Number(value);
      if (count > launchPickCount(draft.picks))
        return respond([
          { text: "Choose no more bags than the number of main items in your basket." },
          ...prompt(draft, catalogue, context),
        ]);
      draft.packingPlan = {
        ...draft.packingPlan,
        separateBags: count > 1,
        bagCount: count,
        allocations: [],
      };
      draft.stage = count === 1 ? "notes" : "packing_allocations";
      return respond();
    }
  }
  if (draft.stage === "packing_allocations") {
    const all = /^all to bag ([123])$/i.exec(text);
    const bag =
      command?.verb === "allocate"
        ? Number(command.value)
        : all
          ? Number(all[1])
          : /^[123]$/.test(text)
            ? Number(text)
            : 0;
    const index = pendingPackingLine(draft);
    if (bag >= 1 && bag <= draft.packingPlan.bagCount && index >= 0) {
      const lineId = `line-${index + 1}`;
      const assigned = draft.packingPlan.allocations
        .filter((entry) => entry.lineId === lineId)
        .reduce((sum, entry) => sum + entry.quantity, 0);
      const quantity = all ? draft.picks[index]!.quantity - assigned : 1;
      const existing = draft.packingPlan.allocations.find(
        (entry) => entry.lineId === lineId && entry.bag === bag,
      );
      if (existing) existing.quantity += quantity;
      else draft.packingPlan.allocations.push({ lineId, bag, quantity });
      return respond();
    }
    return respond();
  }
  if (draft.stage === "notes" && !command) {
    try {
      draft.notes = /^(?:none|no|no thanks)$/i.test(text) ? "" : (normaliseOrderNotes(text) ?? "");
    } catch {
      return respond([
        { text: "Please use up to 1,000 characters of plain text for special requests." },
      ]);
    }
    draft.stage = "review";
    return respond();
  }
  if (command?.verb === "confirm_review" && draft.stage === "review") {
    if (!context.available)
      return respond([
        {
          text: "The kitchen is not accepting new orders right now. Your basket is saved; payment has not started.",
        },
      ]);
    const problem = basketProblem(draft, catalogue) ?? packingProblem(draft);
    if (problem) return respond([{ text: problem + " Please edit and review the order again." }]);
    if (
      !normalizeCustomerName(draft.customer.name) ||
      !normalizeCustomerPhone(draft.customer.phone) ||
      (draft.fulfilment === "curbside" && !parseKerbsideVehicle(draft.vehicle))
    ) {
      draft.stage = detailsStage(draft);
      return respond();
    }
    draft.checkoutLocked = true;
    draft.stage = "checkout";
    return {
      draft,
      replies: [
        {
          text: "Your reviewed basket is ready for secure checkout. Check the final total and any eligible offers there before authorising payment. No payment or kitchen acceptance has been confirmed yet.",
        },
      ],
      requestCheckout: true,
    };
  }
  return respond([
    { text: "Please use the current choices below, or type menu, basket or help." },
    ...prompt(draft, catalogue, context),
  ]);
}
