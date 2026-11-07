export type ReceiptPromotionId =
  "play" | "tiktok" | "instagram" | "skorch" | "tavo-chicken" | "loadd" | "moktl" | "souvano";

export type ReceiptPromotion = Readonly<{
  id: ReceiptPromotionId;
  kind: "qr" | "brand";
  heading: string;
  subtitle: string;
  displayUrl: string;
  targetUrl: string | null;
  width: number;
  height: number;
  rowBytes: number;
  rasterBase64: string;
  rasterSha256: string;
  svgPath: string;
  viewBoxWidth: number;
  viewBoxHeight: number;
  resourceName: string;
  moduleCount?: number;
  quietZone?: number;
  scale?: number;
  moduleRows?: readonly string[];
  sourceRgbaSha256?: string;
}>;

export const receiptPromotions: readonly ReceiptPromotion[];
export function receiptPromotionIndex(
  orderNumber: string | null | undefined,
  orderId: string,
): number;
export function receiptPromotionForOrder(order: {
  orderNumber?: string | null;
  orderId: string;
}): ReceiptPromotion;
