import { createServerFn } from "@tanstack/react-start";
import { readMealDeckBackendConfig } from "./mealdeck-runtime-config";

/**
 * A publishable connection descriptor, not staff authority. Auth/RLS still
 * determine access. A single server-owned pair is shared with the public
 * catalogue/serviceability clients; no separately configured browser database.
 * Never spread the environment or include checkout/provider credentials here.
 */
export const getMealDeckPublicBackend = createServerFn({ method: "GET" }).handler(() =>
  readMealDeckBackendConfig(process.env),
);
