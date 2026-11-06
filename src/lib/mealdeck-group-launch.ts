export const MEALDECK_GROUP_ORDERING_STARTS_AT = "2026-11-09T00:00:00Z";
export const MEALDECK_GROUP_ORDERING_STARTS_MESSAGE =
  "Group ordering starts on 9 November. Existing rooms and payments remain available.";

/** Server time controls new-room admission. No request date or flag is accepted. */
export function newGroupRoomsAreOpen(serverNow = Date.now()): boolean {
  return Number.isFinite(serverNow) && serverNow >= Date.parse(MEALDECK_GROUP_ORDERING_STARTS_AT);
}
