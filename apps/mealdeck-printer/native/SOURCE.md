# Native printer protocol provenance

The fixed Binder adapter is copied from the unchanged MealDeck Printer Setup app in `../mealdeck-printer-probe/native/`. Its source and reviewed public protocol are documented in that app and `docs/mealdeck-senraise-printer-status.md`. The owner confirmed that the published setup sample physically printed on the H10S on 7 November 2026.

The companion retains the exact explicit service identity, descriptor, service-version transaction and bitmap transaction. Each rendered receipt strip is at most 384 × 384 ARGB pixels, with a parcel-size ceiling of 750,000 bytes. A receipt's strips are one logical attempt. No feed, cut, arbitrary byte, remote-content or alternative transport API is exposed. A returned Binder call is `sent_unconfirmed`, never proof of physical paper.
