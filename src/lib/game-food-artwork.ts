import burger from "@/assets/game-burger.png";
import frenchTaco from "@/assets/game-french-taco.png";
import chicken from "@/assets/game-chicken.png";
import cake from "@/assets/game-cake.png";
import fries from "@/assets/game-fries.png";
import drink from "@/assets/game-drink.png";
import paratha from "@/assets/game-paratha.png";
import bun from "@/assets/game-bun.png";
import patty from "@/assets/game-patty.png";
import lettuce from "@/assets/game-lettuce.png";
import salsa from "@/assets/game-salsa.png";
import cheese from "@/assets/game-cheese.png";
import sauce from "@/assets/game-sauce.png";
import type { FoodArt } from "@/lib/dishbee-play";

/** Realistic game faces stay independent of the approved logo corner emblems. */
export const gameFoodArtwork = {
  burger, "french-taco": frenchTaco, chicken, cake, fries, drink, paratha,
  bun, patty, lettuce, tortilla: paratha, salsa, cheese, sauce,
} satisfies Record<FoodArt, string>;