import { createContext, useContext } from "react";

export type MealDeckPwaState = {
  installed: boolean;
  canInstall: boolean;
  offline: boolean;
  updateReady: boolean;
  install: () => Promise<"accepted" | "dismissed" | "unavailable">;
  update: () => void;
};

export const PwaContext = createContext<MealDeckPwaState | null>(null);

export function useMealDeckPwa() {
  const context = useContext(PwaContext);
  if (!context) throw new Error("MealDeck PWA controls require their provider.");
  return context;
}
