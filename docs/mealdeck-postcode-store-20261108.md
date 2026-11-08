# Luton own-driver postcode store — 8 November 2026

**Live symptom:** on mealdeck.co.uk (deployment f7d92201) every delivery-area check except LU4 8NU and LU1 1BU returned `area_unavailable` (503), e.g. LU2 7EZ (2.5 km). Server logs show real customer requests failing from 15:09 UK. No delivery quote had ever been created (`local_driver_quotes` = 0). Cause: outbound postcode API lookups failed inside the Worker runtime (fetch used `redirect: "error"` and `cache: "no-store"`, both unreliable on workerd), and only two postcodes were pinned locally.

**Fix:** `src/lib/mealdeck-luton-postcode-store.ts` — 3,734 live unit postcodes within 5 km of LU4 8NU from OS Code-Point Open (Nov 2026 release, data 30 Oct 2026, OGL). Straight-line British National Grid distance; eligible ≤ 3,000 m. 2,200 postcodes are eligible.

- Independent cross-check vs postcodes.io (ONSPD): 3,718 agreed; 10 too new for postcodes.io; 6 boundary postcodes are 3,002–3,045 m by OS (2,983–3,000 m by ONSPD) and stay **not eligible**.
- Not in store → exact remote lookup (Worker-safe options). Both providers confirm not found → invalid postcode. Providers unreachable → eligible:false (store is complete to 5 km, so it cannot be inside 3 km unless newer than the OS release).
- No district/prefix approval. Quote and payment re-run the same server check; DB still enforces 0–3,000 m and the £15 minimum.

Regenerate from each new Code-Point Open release (download `CodePointOpen` GB CSV, filter `lu.csv` PQ<90 within 5 km of (507014, 223230)).
