import { withMealDeckCloudConnection } from "./mealdeck-cloud-connection";
import type { MealDeckRuntimeEnv } from "./mealdeck-runtime-config";

/** Server-only composition. This never exposes process.env or privileged keys. */
export function mealDeckDeploymentEnv(env: MealDeckRuntimeEnv = process.env): MealDeckRuntimeEnv {
  return withMealDeckCloudConnection(env, {
    projectId: import.meta.env["VITE_SUPABASE_PROJECT_ID"],
    url: import.meta.env["VITE_SUPABASE_URL"],
    publishableKey: import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"],
  });
}
