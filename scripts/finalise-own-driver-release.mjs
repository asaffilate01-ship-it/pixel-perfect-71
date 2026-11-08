import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

// One-shot, explicitly reviewed release repair. It operates on the delivery
// feature branch only; it never touches a database, payment provider or secrets.
const branch = execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim();
if (branch !== "feat/own-driver-luton-delivery") throw new Error("Use the delivery feature branch only");
const read = (path) => readFileSync(path, "utf8");
const write = (path, content) => writeFileSync(path, content);
function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) throw new Error("Expected one reviewed source fragment: " + before.slice(0,80));
  return source.replace(before, () => after);
}

const serverPath = "src/lib/mealdeck-online-checkout.server.ts";
let server = read(serverPath);
if (!server.includes('import { verifyOwnDriverPayment }')) {
  const start = server.indexOf("    // Existing bound delivery quotes MUST NOT be payable after the operator");
  const end = server.indexOf("    await verifyStripeAccount(stripe, fetcher);", start);
  if (start < 0 || end <= start || !server.slice(start,end).includes("const localLookup")) {
    throw new Error("Payment guard differs from the reviewed failing version");
  }
  server = server.slice(0,start) + server.slice(end);
  server = 'import { verifyOwnDriverPayment } from "./mealdeck-own-driver-payment.server";\n' + server;
  const anchor = "    const order = prepared as unknown as PreparedStripeOrder;";
  server = replaceOnce(server, anchor, anchor + `
    // Inspect the actor-scoped canonical order, not browser input. A pending
    // order is not a payment: no Stripe session exists until this guard passes.
    await verifyOwnDriverPayment({
      order,
      deliveryEnabled: env["MEALDECK_OWN_DRIVER_DELIVERY_ENABLED"] === "true" && status.fulfilments.includes("delivery"),
      readQuote: () => rpc(clients.service!, "mealdeck_local_delivery_quote_for_actor", {
        p_quote: parsed.data.quoteId,
        ...(customerId
          ? { p_customer: customerId, p_token_hash: null }
          : { p_customer: null, p_token_hash: guestTokenHash(guestToken!) }),
      }),
      fetcher,
    });`);
  write(serverPath, server);
}

const contractPath = "tests/delivery-migration-source.test.mjs";
let contract = read(contractPath);
for (const name of ["mealdeck_customer_order_receipt", "mealdeck_guest_order_receipt"]) {
  const needle = "/create or replace function public\\." + name + "/";
  if (!contract.includes(needle + "i")) contract = replaceOnce(contract, needle, needle + "i");
}
write(contractPath, contract);

const kdsPath = "tests/mealdeck-kds.test.ts";
let kds = read(kdsPath);
if (!kds.includes('test("own-driver KDS requires a validated address and driver state"')) {
  kds = replaceOnce(kds, '        fulfilment: "delivery",', '        fulfilment: "pickup",');
  kds = replaceOnce(kds, 'for (const fulfilment of ["delivery", "dine_in"] as const)', 'for (const fulfilment of ["dine_in"] as const)');
  kds += `

test("own-driver KDS requires a validated address and driver state", () => {
  const value = board();
  Object.assign(value.orders[0]!, {
    fulfilment: "delivery",
    group_order: false,
    deliveryAddress: { postcode: "LU4 8NU", doorNumber: "14", roadName: "Test Road", addressLine2: "Flat 2" },
    deliveryContact: { name: "Delivery Customer", phone: "+447700900987", email: "not-returned@example.invalid" },
    pickupContact: { name: "Private contact", phone: "+447700900123" },
    driverStatus: "awaiting_driver",
    driverVersion: version,
    deliveryDeadlineAt: "2026-11-04T21:00:00+00:00",
    driverHandoverAt: null,
    deliveredAt: null,
  });
  const order = parseKdsBoard(value, scope).orders[0]!;
  expect(order.deliveryAddress?.postcode).toBe("LU4 8NU");
  expect(order.deliveryContact).toEqual({ name: "Delivery Customer", phone: "+447700900987" });
  expect(order.pickupContact).toBeNull();
  expect(JSON.stringify(order)).not.toContain("not-returned@example.invalid");
  expect(JSON.stringify(order)).not.toContain("Private contact");
  for (const field of ["deliveryAddress", "deliveryContact", "driverVersion", "deliveryDeadlineAt", "driverStatus"]) {
    const invalid = structuredClone(value);
    Object.assign(invalid.orders[0]!, { [field]: null });
    expect(() => parseKdsBoard(invalid, scope)).toThrow("mealdeck_kds_invalid_response");
  }
  const handed = structuredClone(value);
  Object.assign(handed.orders[0]!, { driverStatus: "with_driver", driverHandoverAt: null });
  expect(() => parseKdsBoard(handed, scope)).toThrow("mealdeck_kds_invalid_response");
});
`;
  write(kdsPath, kds);
}

const deliveryPath = "src/lib/mealdeck-own-driver-delivery.ts";
let delivery = read(deliveryPath);
if (!delivery.includes("eslint-disable-next-line no-control-regex")) {
  delivery = replaceOnce(delivery, "const unsafeAddressChars =", "// eslint-disable-next-line no-control-regex -- Reject control characters in customer addresses.\nconst unsafeAddressChars =");
  write(deliveryPath, delivery);
}

const verifyPath = ".github/workflows/verify.yml";
let verify = read(verifyPath);
if (!verify.includes("tests/mealdeck-own-driver-payment.test.ts")) {
  verify = verify.replaceAll("tests/mealdeck-own-driver-delivery.test.ts", "tests/mealdeck-own-driver-delivery.test.ts tests/mealdeck-own-driver-payment.test.ts");
  verify = replaceOnce(verify, "src/lib/mealdeck-own-driver-delivery.ts", "src/lib/mealdeck-own-driver-delivery.ts src/lib/mealdeck-own-driver-payment.server.ts");
  write(verifyPath, verify);
}

// Format only changed application/test source, not historical SQL or manifests.
const names = execFileSync("git", ["diff", "--name-only", "origin/main...HEAD"], { encoding: "utf8" })
  .split("\n").filter((p) => /^(src|tests)\//.test(p) && /\.(?:ts|tsx|mjs|css)$/.test(p));
// The current main branch introduced these four KDS clarity/flavour files
// without matching Prettier formatting. Include them explicitly so the KDS
// verification checks pass without turning off lint rules or altering logic.
for (const p of [
  serverPath, contractPath, kdsPath, deliveryPath,
  "src/lib/mealdeck-kds-dish-clarity.ts",
  "src/lib/mealdeck-kds-flavour.ts",
  "tests/mealdeck-kds-dish-clarity.test.ts",
  "tests/mealdeck-kds-flavour.test.ts",
]) if (!names.includes(p)) names.push(p);
if (names.length) execFileSync("bunx", ["prettier", "--write", ...names], { stdio: "inherit" });
console.log("Applied reviewed payment/KDS/source-contract repairs; production delivery was not enabled.");
