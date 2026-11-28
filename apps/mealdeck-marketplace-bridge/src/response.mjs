/** Bounded JSON readback for the isolated marketplace bridge. Never expose upstream bodies. */
const LIMIT = 100_000;
const reject = () => { throw new Error("bridge_error"); };
function cancel(stream) {
  try { void stream?.cancel().catch(() => {}); } catch { /* Best-effort resource cleanup. */ }
}

export async function readBridgeReply(response) {
  let reader;
  let complete = false;
  try {
    const mediaType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    const declared = response.headers.get("content-length");
    if (!response.ok || response.redirected || mediaType !== "application/json" || !response.body ||
        (declared !== null && (!/^\d+$/.test(declared) || Number(declared) >= LIMIT))) reject();
    reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let bytes = 0;
    let raw = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) { complete = true; break; }
      bytes += value.byteLength;
      if (bytes >= LIMIT) reject();
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
    const reply = JSON.parse(raw);
    if (!reply || typeof reply !== "object" || Array.isArray(reply)) reject();
    return reply;
  } catch {
    reject();
  } finally {
    if (reader) {
      if (!complete) cancel(reader);
      reader.releaseLock();
    } else if (!complete) cancel(response?.body);
  }
}
