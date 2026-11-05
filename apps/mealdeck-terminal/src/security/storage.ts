import * as SecureStore from "expo-secure-store";
import { recoverySchema, type Recovery } from "../api/types";

const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  keychainService: "uk.co.mealdeck.terminal",
};
export const refreshTokenKey = "mealdeck-terminal-refresh-v1";
export const secureRead = (key: string) => SecureStore.getItemAsync(key, options);
export const secureWrite = (key: string, value: string) =>
  SecureStore.setItemAsync(key, value, options);
export const secureDelete = (key: string) => SecureStore.deleteItemAsync(key, options);

export function recoveryJournal(staffId: string) {
  const key = "mealdeck-terminal-attempt-v1-" + staffId;
  return {
    async read(): Promise<Recovery | null> {
      const raw = await secureRead(key);
      if (raw === null) return null;
      const parsed = recoverySchema.safeParse(JSON.parse(raw));
      if (!parsed.success)
        throw new Error(
          "The saved payment recovery record could not be read. Ask a manager to reconcile this device's orders before collecting again.",
        );
      return parsed.data;
    },
    async write(value: Recovery) {
      await secureWrite(key, JSON.stringify(recoverySchema.parse(value)));
    },
    async clear() {
      await secureDelete(key);
    },
  };
}
