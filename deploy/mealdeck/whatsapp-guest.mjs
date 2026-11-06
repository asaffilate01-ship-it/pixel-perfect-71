import { readFileSync } from "node:fs";
export function buildWhatsappGuestSql() {
  return readFileSync(new URL("./whatsapp-guest.sql", import.meta.url), "utf8");
}
