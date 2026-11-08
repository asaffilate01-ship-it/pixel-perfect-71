# MealDeck Luton offline postcode coverage

## Production rules
- Kitchen origin: **LU4 8NU** (postcode centroid).
- Eligible delivery postcode: valid full UK unit postcode with verified coordinates and distance **<=3,000 metres** (Haversine) from the kitchen centroid. **This is not driving distance.**
- Free own-driver delivery requires a server-verified final payable basket total of **at least £15 after discounts**. Kitchen Pause/Closed, payment and KDS verification controls still apply.
- No inference by partial postcode, outcode, district or town name.

## Local dataset
`src/lib/mealdeck-luton-postcodes.json` contains **10,762 exact LU unit postcode centroids**, derived from the open CSV `postcodes/LU.csv` in [Open Innovations Postcodes2LatLon](https://github.com/odileeds/Postcodes2LatLon), source blob SHA `e24b18ec9164066e03d9f658488682fa0b20aa38`. That repository describes its source as the **ONS National Statistics Postcode Lookup** under the [Open Government Licence](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/), with a dataset update commit on **4 February 2026** titled "Update to November 2025". Contains public sector information licensed under the Open Government Licence v3.0. The code in that source repository uses MIT.

We load these server-side for exact postcode keys (around **3,947** are within the 3,000m radius using this source). Where a postcode is missing or newly allocated, the server calls Postcodes.io, then GetTheData, validating the *exact* normalized postcode and usable coordinates. Any lookup outage or ambiguity remains **unavailable**, never eligible by guess. Verified pinned postcode centroids for LU4 8NU and LU1 1BU retain greater precision.

## Maintenance
The local directory is a **November 2025** snapshot. It does not prove that a postcode is still live in November 2026, nor include all new 2026 allocations. Before promoting broadly, replace/refresh the CSV from the latest ONSPD (August 2026 or subsequent) and exclude terminated postcodes and poor-quality centroids. Keep source/version attribution; inspect borderline distances within 50m of the radius for potential centroid changes. A live reference-source lookup can still be used as confirmation when operationally possible.

## Tests / release
`bun test tests/mealdeck-own-driver-delivery.test.ts` plus the existing checkout, Stripe, KDS and PostgreSQL CI checks. Production verification must inspect GET `/api/checkout` (available and delivery enabled) and POST `/api/checkout` with `action=delivery_area` for inside, outside and unrecognized postcodes. No order, charge or dispatch is needed for that read-only check.
