/** The local journal must be resolved before hiding an outstanding paper check.
 * A browser-dialog receipt can have no local journal entry; only an explicit
 * 404 may be treated as that case. Network/auth/held errors must propagate. */
export async function confirmReceiptPaper({
  resolveLocal,
  confirmServer,
}: {
  resolveLocal?: () => Promise<"resolved" | "missing">;
  confirmServer: () => Promise<unknown>;
}): Promise<void> {
  if (resolveLocal) await resolveLocal();
  await confirmServer();
}
