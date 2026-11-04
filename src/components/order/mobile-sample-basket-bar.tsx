import {formatPence} from "@/lib/mealdeck";
import type {SampleBasketSummary} from "@/lib/mealdeck-preview-basket";
import {sampleBasketBarModel} from "@/lib/mealdeck-sample-basket-bar";

/** Mobile-first sample basket shortcut. Never presents a checkout button. */
export function MobileSampleBasketBar({summary}:{summary:SampleBasketSummary}){
  const model=sampleBasketBarModel(summary);
  if(!model.visible||model.subtotalPence===null)return null;
  return <aside className="md-mobile-sample-basket" aria-label="Sample basket shortcut">
    <div className="min-w-0">
      <p className="text-sm font-bold">{model.dishLabel} · {model.brandLabel}</p>
      <p className="text-xs text-white/80">{formatPence(model.subtotalPence)} illustrative, delivery excluded</p>
    </div>
    <a href="#sample-deck"
      className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-[var(--md-yellow)] px-4 text-sm font-bold text-[var(--md-black)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    >Review deck</a>
  </aside>;
}
