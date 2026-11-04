import mealdeck from "@/assets/approved-logos/mealdeck.webp";
import paratique from "@/assets/approved-logos/paratique.webp";
import taconelle from "@/assets/approved-logos/taconelle.webp";
import tavoChicken from "@/assets/approved-logos/tavo-chicken.webp";
import skorch from "@/assets/approved-logos/skorch.webp";
import loadd from "@/assets/approved-logos/loadd.webp";
import vyta from "@/assets/approved-logos/vyta.webp";
import moktl from "@/assets/approved-logos/moktl.webp";
import icova from "@/assets/approved-logos/icova.webp";
import tarkaBox from "@/assets/approved-logos/tarka-box.webp";
import sabzora from "@/assets/approved-logos/sabzora.webp";
import nusara from "@/assets/approved-logos/nusara.webp";
import forvello from "@/assets/approved-logos/forvello.webp";
import pastarivo from "@/assets/approved-logos/pastarivo.webp";
import souvano from "@/assets/approved-logos/souvano.webp";
import riseAndGriddle from "@/assets/approved-logos/rise-and-griddle.webp";

/** Shared identity assets only. Marketing and kitchen availability stay separate. */
export const approvedBrandLogos = {
  paratique,
  taconelle,
  "tavo-chicken": tavoChicken,
  skorch,
  loadd,
  vyta,
  moktl,
  icova,
  "tarka-box": tarkaBox,
  sabzora,
  nusara,
  forvello,
  pastarivo,
  souvano,
  "rise-and-griddle": riseAndGriddle,
} as const;

export type ApprovedBrandId = keyof typeof approvedBrandLogos;

/** The complete approved stacked-card artwork, with its transparent padding intact. */
export const mealDeckArtwork = { src: mealdeck, width: 1106, height: 1116 } as const;

export const logoDimensionsBySrc: Record<string, { width: number; height: number }> = {
  [mealdeck]: { width: 1106, height: 1116 },
  [paratique]: { width: 1658, height: 1146 },
  [taconelle]: { width: 1658, height: 1197 },
  [tavoChicken]: { width: 1314, height: 1406 },
  [skorch]: { width: 1658, height: 1200 },
  [loadd]: { width: 1658, height: 1209 },
  [vyta]: { width: 1354, height: 1389 },
  [moktl]: { width: 1658, height: 1146 },
  [icova]: { width: 2246, height: 1006 },
  [tarkaBox]: { width: 1658, height: 1211 },
  [sabzora]: { width: 1354, height: 1394 },
  [nusara]: { width: 1264, height: 640 },
  [forvello]: { width: 1658, height: 1197 },
  [pastarivo]: { width: 1484, height: 1286 },
  [souvano]: { width: 1286, height: 713 },
  [riseAndGriddle]: { width: 1564, height: 1281 },
};
