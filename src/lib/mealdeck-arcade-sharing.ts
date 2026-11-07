import { GAME_CATALOGUE } from "@/lib/dishbee-play";
import {
  arcadeGameLink,
  isArcadeGameId,
  parseArcadeSearch,
  type ArcadeGameId,
} from "@/lib/mealdeck-arcade-library";
import { parseArcadeCompletion, type ArcadeCompletion } from "@/lib/mealdeck-play-progress";

export type ArcadeShareRequest = {
  game: ArcadeGameId;
  brand?: string | undefined;
  dailyDate?: string | undefined;
  /** Public setup only: Sauce Switch accepts 3/4 and Bento Sudoku accepts 4/6. */
  size?: number | undefined;
  completion?: ArcadeCompletion | undefined;
};

export type ArcadeShareContent = {
  game: ArcadeGameId;
  gameName: string;
  title: string;
  text: string;
  url: string;
  headline: string;
  detail: string;
  context: string;
  /** A safe download name, including the PNG extension. */
  filename: string;
  isResult: boolean;
};

type ShareVariant = { label: string; size?: 3 | 4 | 6 };
const VARIANTS: Readonly<Record<string, ShareVariant>> = {
  "sauce-switch:3x3": { label: "3 × 3 tray", size: 3 },
  "sauce-switch:4x4": { label: "4 × 4 tray", size: 4 },
  "bento-sudoku:4x4": { label: "4 × 4 tray", size: 4 },
  "bento-sudoku:6x6": { label: "6 × 6 tray", size: 6 },
  "tray-tactics:solo-casual": { label: "Solo · Casual chef" },
  "tray-tactics:solo-clever": { label: "Solo · Clever chef" },
  "tray-tactics:local-casual": { label: "Two players" },
  "tray-tactics:local-clever": { label: "Two players" },
  "tray-lines:solo-casual": { label: "Solo · Casual chef" },
  "tray-lines:solo-clever": { label: "Solo · Clever chef" },
  "tray-lines:local-casual": { label: "Two players" },
  "tray-lines:local-clever": { label: "Two players" },
  "snack-trail:slow": { label: "Slow pace" },
  "snack-trail:standard": { label: "Standard pace" },
  "snack-trail:step": { label: "Untimed step play" },
  "skewer-sort:3-foods": { label: "3 foods · Small plate" },
  "skewer-sort:4-foods": { label: "4 foods · Full plate" },
  "pantry-sweep:gentle-5x5": { label: "5 × 5 · Gentle pantry" },
  "pantry-sweep:bigger-6x6": { label: "6 × 6 · Bigger pantry" },
};

function shareVariant(completion: ArcadeCompletion): ShareVariant | undefined {
  // Menu Quest has one fixed size, including older records without a variant.
  if (completion.game === "menu-quest") return { label: "8 × 8 word search" };
  if (!completion.variant) return undefined;
  const key = `${completion.game}:${completion.variant}`;
  return Object.hasOwn(VARIANTS, key) ? VARIANTS[key] : undefined;
}

function resultHeadline(completion: ArcadeCompletion): string {
  switch (completion.game) {
    case "sauce-switch":
      return "Tray cleared";
    case "menu-quest":
      return "All words found";
    case "bento-sudoku":
      return "Puzzle solved";
    case "skewer-sort":
      return "Skewers sorted";
    case "snack-trail":
      return completion.result === "win" ? "Tray filled" : "Trail finished";
    case "pantry-sweep":
      return completion.result === "win" ? "Pantry cleared" : "Chilli found";
    case "tray-tactics":
    case "tray-lines":
      // Local play records a completed shared round, not a victory over the chef.
      if (completion.variant === "local-casual" || completion.variant === "local-clever")
        return completion.result === "draw" ? "Even portions" : "Round complete";
      return completion.result === "win"
        ? "Round won"
        : completion.result === "draw"
          ? "Even portions"
          : completion.result === "loss"
            ? "Round finished"
            : "Round complete";
  }
}

function countLabel(value: number, unit: string): string {
  // The completion parser bounds every metric to a safe integer from 0 to 100,000.
  return `${String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} ${unit}${value === 1 ? "" : "s"}`;
}

function resultDetail(completion: ArcadeCompletion): string {
  const parts: string[] = [];
  if (completion.game === "snack-trail" && completion.score !== undefined)
    parts.push(countLabel(completion.score, "snack"));
  if (completion.moves !== undefined) parts.push(countLabel(completion.moves, "move"));
  if (completion.hints !== undefined) parts.push(countLabel(completion.hints, "hint"));
  return parts.join(" · ") || "Finished round";
}

/**
 * Build public copy from allowlisted facts only. IDs, timestamps, boards and any
 * unknown input fields never enter the returned text, card fields or links.
 */
export function buildArcadeShareContent(request: ArcadeShareRequest): ArcadeShareContent {
  const game: ArcadeGameId = isArcadeGameId(request.game) ? request.game : "feast-2048";
  const gameName = GAME_CATALOGUE.find((entry) => entry.id === game)!.name;
  const parsed = parseArcadeCompletion(request.completion);
  const completion = parsed?.game === game ? parsed : null;
  const variant = completion ? shareVariant(completion) : undefined;
  // A result's frozen setup takes precedence over the surrounding page. Even a
  // missing result date or size must not inherit an unrelated page's setup.
  const publicSetup = parseArcadeSearch({
    game,
    daily: completion ? completion.dailyDate : request.dailyDate,
    size: completion ? variant?.size : request.size,
  });
  const date = publicSetup.daily;
  const sameDaily =
    !!completion && !!date && (game === "menu-quest" || variant?.size !== undefined);
  const linkedDate = completion ? (sameDaily ? date : undefined) : date;
  const url = arcadeGameLink(game, request.brand, { daily: linkedDate, size: publicSetup.size });
  const headline = completion ? resultHeadline(completion) : "Your turn";
  const detail = completion ? resultDetail(completion) : "Free to play · No sign-in needed";
  const contextParts: string[] = [];
  if (variant?.label) contextParts.push(variant.label);
  else if (!completion && publicSetup.size)
    contextParts.push(`${publicSetup.size} × ${publicSetup.size} tray`);
  if (date) contextParts.push(`Daily · ${date} UTC`);
  const context = contextParts.join(" · ") || "MealDeck Play";
  const invitation = sameDaily
    ? "Your turn: try the same daily puzzle."
    : "Your turn: try the game.";
  const text = completion
    ? `${headline} in ${gameName}. ${detail}. ${context === "MealDeck Play" ? "" : `${context}. `}${invitation} Free to play. No sign-in needed.`
    : `Your turn: try ${gameName}${date ? `’s daily puzzle for ${date} UTC` : " on MealDeck"}. Free to play. No sign-in needed.`;
  return {
    game,
    gameName,
    title: `${gameName} | MealDeck Play`,
    text,
    url,
    headline,
    detail,
    context,
    filename: `mealdeck-${game}-${completion ? "result" : "invite"}.png`,
    isResult: completion !== null,
  };
}

/** Copy/WhatsApp use a composed message; native share receives text and URL separately. */
export function arcadeShareMessage(content: ArcadeShareContent): string {
  return `${content.text}\n${content.url}`;
}

export function arcadeWhatsAppLink(content: ArcadeShareContent): string {
  return `https://wa.me/?text=${encodeURIComponent(arcadeShareMessage(content))}`;
}
