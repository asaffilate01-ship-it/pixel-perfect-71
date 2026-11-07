# MealDeck WhatsApp worker

The official Meta webhook persists inbound events before acknowledging them. This supervised Node 22+ worker drains those events and the outbound queue through the authenticated MealDeck server. It does not hold database, Meta, Stripe or AI credentials itself.

Configure the process supervisor with `MEALDECK_WHATSAPP_WORKER_ORIGIN=https://mealdeck.co.uk` and the same `MEALDECK_WHATSAPP_WORKER_SECRET` configured on MealDeck's server, then run:

```sh
node apps/mealdeck-whatsapp-worker/worker.mjs
```

Inject the secret using the deployment host's secret configuration. Do not put it in the command line, a public client variable, logs or a committed env file. Restart on failure, capture count-only operational logs, and alert on repeated connection/authentication failure or growing queue age. Multiple instances are protected by database leases, but one supervised instance is sufficient for the initial channel.

The worker waits one second between successful polls and backs off on failure. A request timeout does not release an unknown provider send: the database holds expired sending leases for staff review. On SIGTERM/SIGINT, the process finishes its current bounded request and exits.

See [the implementation and activation runbook](../../docs/mealdeck-whatsapp-ordering.md). Running this process alone does not enable ordering.
