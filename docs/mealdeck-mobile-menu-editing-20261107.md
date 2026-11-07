# Mobile Menu Manager editing — 7 November 2026

## Report and changes

The owner reported that product details could not be changed from Edit on a phone.
The product editor used `scrollIntoView({ block: "nearest" })` on its heading,
which could place only the heading at the bottom of the viewport, leaving all
fields below it. A failed saved-menu refresh also disabled the entire local draft
fieldset until another refresh succeeded, with recovery feedback above the long
product browser.

Edit now brings the product heading and form to the top of the viewport. Add
product uses the same positioning. A Back to products control on single-column
screens returns to the list without discarding the draft. Mobile Save and Discard
buttons occupy separate full-width rows.

An authorised menu editor can continue changing its existing product draft after
a failed menu refresh. Save remains blocked until the saved catalogue can be
verified. Busy writes still lock the form. The original global permission,
preflight read, conflict, exact-price, deactivation-confirmation and database
authorisation checks remain in place. Kitchen availability-only roles still see
View and disabled product fields, with no Save button.

Product feedback now appears beside the product form, creation feedback beside
the creation form, and menu-wide actions retain their menu-level feedback. A
reload failure includes a local retry action. The create form keeps its existing
reconciliation lock after an uncertain creation outcome.

## Verification

- 40 focused existing menu-manager, menu-choice, menu-structure and operations
  tests passed (227 assertions).
- TypeScript and focused ESLint checks passed during implementation; final
  repository CI supplies the release build check. The local full production
  build was killed by the workspace memory limit after transforming the client
  modules, so it is not recorded as a successful build.
- The actual `OpsMenuPanel`, scoped styles and `StaffMobileNav` were exercised in
  an isolated browser fixture with synthetic in-memory RPCs. Browser fetch/XHR
  were blocked; no real catalogue, account, price or database record was changed.
- At 390px, name, description and price edits were saved and read back through
  the synthetic transport. After a deliberately failed refresh, product fields
  remained editable while Save stayed disabled; Reload then Save retained the
  draft and confirmed the changed values.
- At 320px, a rejected save kept the draft and displayed the error beside Save.
  Save and Discard measured 44px high, with no document horizontal overflow.
  Retrying the save succeeded.
- At 768px and 1280px the same product values survived resizing, fields remained
  editable, and the document had no horizontal overflow. The kitchen-only role
  retained disabled product fields and no Save button.

These are browser viewport and synthetic-transport checks, not physical-phone
keyboard testing or proof of live staff authentication and database saving.
Website publication and a signed-in live check remain separate release evidence.
