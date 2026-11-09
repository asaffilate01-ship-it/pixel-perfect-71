# Marketplace device evidence

## Uber Eats — owner photos supplied 9 November 2026

This is a sanitised observation record from owner-provided photographs, not a connected-device inspection or a completed commissioning result. The uploaded photographs and their customer/order information, serial number, IMEI and local network address are not reproduced here.

| Field | Reported or observed evidence |
| --- | --- |
| Platform | Uber Eats merchant order screen |
| Manufacturer | SUNMI |
| Model | V3 PLUS; device details show `V3_PLUS` |
| Operating system | Android 14 |
| Security patch shown | 2026-03-05 |
| Android Enterprise (AFW) support shown | Yes |
| Device capacity shown | 64.00 GB |
| Merchant app version and package | Not shown; unverified |
| USB/wireless debugging and administrator permissions | Not shown; unverified |
| MealDeck bridge connection | Not established |

The AFW-support field does not identify the actual enrollment, device owner, management restrictions or debugging permissions. The terminal's reported Active status is not a MealDeck bridge heartbeat.

## Order-screen evidence and implementation implications

- A short alphanumeric customer/courier reference is visible. The KDS must preserve the actual reference exactly. A stable order key for deduplication still needs verification; the short reference alone is not assumed globally unique.
- Ready and Adjust order controls appear in this particular order view. Their enabled state, accessibility selectors, action semantics and resulting readback have not been tested. No action capability is enabled from the photograph.
- Meal and serving selections are nested beneath their parent food. Selected zero-price options still carry preparation instructions and must remain attached to the correct item.
- The photograph shows a partial/scrolled order. It is not a complete import fixture. The complete item/option hierarchy, quantities, notes, source prices and independent completeness checks require inspection through authorised access.
- Accept, any separate Preparing action, merchant Handover and actual customer/courier updates are not demonstrated.

The existing connector rejects incomplete or inconsistent snapshots. It has no generic scrolling fallback. If the real application exposes only visible rows, commissioning must establish a reviewed, bounded method to retrieve and verify the complete order before imports can be enabled.

## Compatibility assessment

Android 14 exceeds UiAutomator2's documented Android 8 minimum for driver versions 6 and later. This removes a minimum-OS concern but does not certify the SUNMI firmware, merchant app, administrator policy or available UI hierarchy.

Pin a compatible host/server/driver combination during setup. The current official table pairs UiAutomator2 9 with Appium 4 and driver versions 5 through 8.7.3 with Appium 3. Do not infer a tested toolchain from the model photograph or install unqualified latest versions on the terminal.

Real-device use requires authorised USB or wireless debugging and an approved host connection. Compatible on-device UiAutomator2 helpers must be provisioned through authorised setup because the MealDeck runtime deliberately skips automatic installation, reset and unlocking.

Primary reference, checked 9 November 2026: [Appium UiAutomator2 getting started and compatibility requirements](https://appium.github.io/appium-uiautomator2-driver/latest/getting-started/).

## Next evidence

1. The Uber merchant app's App info/version screen. Obtain the actual package through authorised device inspection if the screen does not display it.
2. Whether normal Android Settings and Developer options are available, including the current USB-debugging state or an administrator restriction.
3. Who manages the terminal and what Windows, macOS or Linux computer can remain connected to the two Sunmis.
4. The equivalent model, Android and merchant-app details for the separate Just Eat terminal.

A later authorised session must verify exact device, application and store identity; every order line and option; stable order identity; and a controlled action with matching-order readback. Observe the actual customer/courier effect before representing it as supported.

## Current activation

The Uber Android example and profile remain disabled/unconfigured. The production app package, screen selectors and action mappings remain unset. No device connection, real order import, acceptance, Ready update or handover was performed from these photographs.
