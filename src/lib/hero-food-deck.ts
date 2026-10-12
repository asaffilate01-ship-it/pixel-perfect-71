export const foodSuits = ["burger", "french-taco", "chicken", "cake"] as const;
export const foodRanks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "C", "H", "M"] as const;
export const chefTitles: Record<string, string> = { C: "Chef", H: "Head chef", M: "Master chef" };

export const heroFoodDeck = foodSuits.flatMap((suit) =>
  foodRanks.map((rank) => ({ id: `${suit}-${rank}`, suit, rank })),
);