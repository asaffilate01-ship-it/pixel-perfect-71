import burger from "@/assets/card-suit-burger.png";
import frenchTaco from "@/assets/card-suit-french-taco.png";
import chicken from "@/assets/card-suit-chicken.png";
import cake from "@/assets/card-suit-cake.png";
import fries from "@/assets/card-suit-fries.png";
import drink from "@/assets/card-suit-drink.png";
import paratha from "@/assets/card-suit-paratha.png";
import bun from "@/assets/ingredient-bun.png";
import patty from "@/assets/ingredient-patty.png";
import lettuce from "@/assets/ingredient-lettuce.png";
import salsa from "@/assets/ingredient-salsa.png";
import cheese from "@/assets/ingredient-cheese.png";
import sauce from "@/assets/ingredient-sauce.png";

export const suitArtwork = {
  burger,
  "french-taco": frenchTaco,
  chicken,
  cake,
  fries,
  drink,
  paratha,
};

/** Ingredient tiles reuse the same crimson stencil language. */
export const tileArtwork = {
  bun,
  patty,
  lettuce,
  tortilla: paratha,
  chicken,
  salsa,
  fries,
  cheese,
  sauce,
};
