# Default loud alerts and receipt branding

Owner decisions: 6 November 2026. These source changes make new KDS and printer sound preferences enabled at 100% volume and add the approved MealDeck logo to receipts. Publication and physical-device acceptance remain separate outcomes.

## Published release

PR110 was normally merged as `c982c8c945dfb4b66ab9c0718b6fd6f3c42fefa4`; all 25 CI jobs passed. Deployment `979a7cce-69b4-4516-98b1-a897ca3cf499` was verified on the canonical public pages at 20:42 UK on 6 November. Public checkout remained available. An already-open staff PWA must load this version to use the new renderer and sound controller. A local Node bridge is separate software and is not updated by website publication.

## Sound

The shared controller tracks the actual AudioContext state. A saved explicit mute or volume choice is retained. On a device without saved preferences, sound is requested by default at full application volume. If the browser requires interaction, a compact visible Enable sound prompt remains on the staff screen even when other tools are hidden; an ordinary trusted interaction can unlock it too. The interface never reports an inactive or suspended audio context as working sound.

The distinct KDS and printer patterns use a bounded peak gain of 0.98, with no overlapping tone envelopes. Existing replay, hydration, reconnect and cross-window deduplication remain. Unlocking does not replay previous arrivals. Mute, zero volume, suspension and cleanup stop active and scheduled audio. Physical loudness also depends on the device's media volume and speaker; no actual-device loudness measurement is claimed.

`tests/mealdeck-staff-audio.test.ts` checks default preferences, saved mute/volume, trusted activation, asynchronous resume/mute races, blocked/unavailable state, no replay and disposal. Existing alert-ledger tests cover observed-order deduplication.

## Logo and optional receipt details

Browser receipts use `src/assets/approved-logos/mealdeck.webp`, the complete approved artwork. The print flow preloads the fixed image and waits for the rendered receipt image before beginning a browser send. A failed image load therefore leaves the job outside a possible physical send.

The Node/TCP ESC/POS bridge uses a fixed 256×258 monochrome derivative of the same artwork. `tools/receipt-bridge/build-logo.py` verifies the existing approval manifest and reproducibly generates the asset and raster module. There is no runtime external image URL or caller-supplied logo. The existing canonical claimed-receipt comparison, payload fingerprint, durable copy journal and one bounded send remain in place. Actual printer compatibility and paper output require device commissioning.

The compatible client accepts optional canonical meal-component and cash-method fields. Existing receipts without those fields retain their original fingerprints and display. Displaying explicit included fries, drinks and replacements depends on the separately guarded meal-component database projection; the client does not infer them from editable product labels. Cash metadata is shown only when supplied by the canonical receipt.

## Senraise bridge boundary

The Node/TCP bridge is for a supported network printer on its configured host. It does not connect an Android terminal's built-in printer merely because the PWA is installed. A dedicated signed Android companion can use the same receipt queue while the PWA remains the operating screen. Its hardware adapter requires the matching manufacturer service/SDK, installed service version and a real device check. See [the Senraise integration record](./mealdeck-senraise-printer-status.md).
