import receiptLogoSource from "@/assets/approved-logos/mealdeck.webp";

/** The approved, complete MealDeck artwork. Receipt data cannot supply an image. */
export { receiptLogoSource };

/** Wait before authorising a browser send, so a slow/failed asset cannot produce
 * a blank logo after a receipt has entered its one-send lifecycle. */
export async function waitForReceiptLogo(image: HTMLImageElement): Promise<void> {
  if (image.complete && image.naturalWidth > 0) {
    if (typeof image.decode === "function") await image.decode();
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const clear = () => {
      clearTimeout(timer);
      image.removeEventListener("load", loaded);
      image.removeEventListener("error", failed);
    };
    const loaded = () => {
      clear();
      if (image.naturalWidth > 0) resolve();
      else reject(new Error("The receipt logo could not be loaded. Try again before printing."));
    };
    const failed = () => {
      clear();
      reject(new Error("The receipt logo could not be loaded. Try again before printing."));
    };
    const timer = setTimeout(failed, 10000);
    image.addEventListener("load", loaded, { once: true });
    image.addEventListener("error", failed, { once: true });
    // A cached asset may have finished between the initial check and listeners.
    if (image.complete) {
      if (image.naturalWidth > 0) loaded();
      else failed();
    }
  });
  if (typeof image.decode === "function") await image.decode();
}

export async function preloadReceiptLogo(): Promise<void> {
  const image = new Image();
  image.src = receiptLogoSource;
  await waitForReceiptLogo(image);
}
