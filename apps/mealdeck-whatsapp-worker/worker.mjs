// Run with Node 22+ under a process supervisor. Secrets are environment-only.
// No customer content or provider credentials are written to stdout/stderr.
const origin = process.env.MEALDECK_WHATSAPP_WORKER_ORIGIN;
const secret = process.env.MEALDECK_WHATSAPP_WORKER_SECRET;
if (origin !== "https://mealdeck.co.uk" || !secret || !/^[A-Za-z0-9_-]{32,256}$/.test(secret)) {
  console.error("Configure the canonical MealDeck origin and worker credential.");
  process.exit(1);
}
let stopping = false;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
while (!stopping) {
  let delay = 1000;
  try {
    const response = await fetch(origin + "/api/whatsapp/worker", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(55_000),
      headers: { Authorization: "Bearer " + secret },
    });
    if (!response.ok) {
      console.error("WhatsApp worker request failed (HTTP " + response.status + ").");
      delay = response.status === 401 || response.status === 403 ? 30_000 : 5000;
    } else {
      const counts = await response.json();
      if (counts.processed || counts.sent || counts.held)
        console.log(
          JSON.stringify({
            processed: Number(counts.processed) || 0,
            sent: Number(counts.sent) || 0,
            held: Number(counts.held) || 0,
          }),
        );
    }
  } catch {
    console.error("WhatsApp worker connection unavailable.");
    delay = 5000;
  }
  if (!stopping) await new Promise((resolve) => setTimeout(resolve, delay));
}
