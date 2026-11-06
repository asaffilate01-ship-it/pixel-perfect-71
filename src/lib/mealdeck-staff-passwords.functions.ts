import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { staffPasswordSchema } from "./mealdeck-staff-passwords";

export const setStaffPassword = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const result = staffPasswordSchema.safeParse(input);
    if (!result.success) throw new Error("Choose an approved account and a password of 12–128 characters.");
    return result.data;
  })
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "no-store, private");
    const { updateStaffPassword } = await import("./mealdeck-staff-passwords.server");
    return updateStaffPassword(getRequest(), data, process.env);
  });