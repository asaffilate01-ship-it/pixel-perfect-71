import { readMealDeckBackendConfig, type MealDeckRuntimeEnv } from "./mealdeck-runtime-config";

// The dedicated APK only talks to this independent MealDeck project. This public
// descriptor grants no identity or printer permissions: all RPCs still verify
// the signed-in account and its current kitchen assignment.
export const MEALDECK_PRINTER_BACKEND = "https://srsxybepwujuawyutnbs.supabase.co";

export function handlePrinterConfigRequest(request: Request, env: MealDeckRuntimeEnv) {
  const headers = {
    "Cache-Control": "no-store, private",
    "X-Content-Type-Options": "nosniff",
  };
  if (request.method !== "GET")
    return Response.json(
      { error: "method_not_allowed" },
      { status: 405, headers: { ...headers, Allow: "GET" } },
    );
  const config = readMealDeckBackendConfig(env);
  if (config.status !== "ready" || config.backend.url !== MEALDECK_PRINTER_BACKEND)
    return Response.json(
      {
        schemaVersion: 1,
        status: "unavailable",
        message: "The MealDeck printer connection is unavailable. Please try again later.",
      },
      { status: 503, headers },
    );
  return Response.json(
    {
      schemaVersion: 1,
      status: "ready",
      backend: {
        url: config.backend.url,
        publishableKey: config.backend.publishableKey,
      },
    },
    { headers },
  );
}
