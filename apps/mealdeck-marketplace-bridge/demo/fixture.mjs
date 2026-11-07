import { createServer } from "node:http";
import { once } from "node:events";
import { BridgeError } from "../src/contracts.mjs";
import { validateProfile } from "../src/profile.mjs";

/** Synthetic fixtures only. These selectors and labels are not claims about either merchant application. */
export function fixtureProfile(platform, pageUrl = "http://127.0.0.1:1/fixture") {
  const select = (key) =>
    platform === "uber_eats"
      ? { using: "css", value: `[data-key="${key}"]` }
      : { using: "id", value: `fixture:${key}` };
  const field = (key, extra = {}) => ({ selector: select(key), ...extra });
  const profile = {
    schemaVersion: 1,
    environment: "fixture",
    platform,
    profileId: `offline-${platform}-fixture`,
    profileVersion: "1",
    commissioning: { status: "verified" },
    transport: platform === "uber_eats" ? "playwright" : "appium",
    pageUrl,
    appPackage: "uk.co.mealdeck.fixture",
    screen: {
      storeId: field("store"),
      guards: [{ field: field("guard"), equals: "OFFLINE FIXTURE" }],
      orders: select("order"),
      empty: select("empty"),
      orderCount: field("order-count", { format: "integer" }),
      identity: { externalOrderId: field("stable-id"), displayReference: field("reference") },
    },
    fields: {
      state: field("state", {
        map: {
          New: "new",
          Accepted: "accepted",
          Preparing: "preparing",
          Ready: "ready",
          Collected: "handed_over",
          Cancelled: "cancelled",
        },
      }),
      fulfilment: field("fulfilment", {
        map: {
          Collection: "collection",
          Courier: "platform_delivery",
          Merchant: "merchant_delivery",
        },
      }),
      paymentResponsibility: field("payment", { map: { "Platform managed": "platform" } }),
      currency: field("currency"),
      placedAt: field("placed", { format: "iso_datetime" }),
      totalPence: field("total", { format: "gbp" }),
      notes: field("notes", { optional: true }),
      items: {
        selector: select("item"),
        count: field("item-count", { format: "integer" }),
        name: field("name"),
        quantity: field("quantity", { format: "integer" }),
        unitPricePence: field("unit-price", { format: "gbp", optional: true }),
        notes: field("line-notes", { optional: true }),
        modifiers: {
          selector: select("modifier"),
          count: field("modifier-count", { format: "integer" }),
          name: field("modifier-name"),
          quantity: field("modifier-quantity", { format: "integer" }),
        },
      },
    },
    actions: {
      accept: {
        button: select("accept"),
        fromStates: ["new"],
        fulfilments: ["collection", "platform_delivery", "merchant_delivery"],
      },
      preparing: null,
      ready: {
        button: select("ready"),
        fromStates: ["accepted", "preparing"],
        fulfilments: ["collection", "platform_delivery", "merchant_delivery"],
      },
      handover: { button: select("handover"), fromStates: ["ready"], fulfilments: ["collection"] },
    },
  };
  return validateProfile(profile, { fixture: true });
}

export class FixtureTransport {
  constructor(platform = "uber_eats") {
    this.next = 1;
    this.mutationClicks = 0;
    this.contextAvailable = true;
    const node = (key, value = "", children = []) => ({
      id: `element-${this.next++}`,
      key,
      text: value,
      children,
    });
    this.node = node;
    this.store = node("store", "fixture-store");
    this.state = node("state", "New");
    this.reference = node("reference", platform === "uber_eats" ? "0AB19" : "000123456789");
    this.stableId = node("stable-id", `fixture-stable-${platform}-order`);
    this.food = node("name", "Burger");
    this.payment = node("payment", "Platform managed");
    this.fulfilment = node("fulfilment", "Courier");
    const firstLine = node("item", "", [
      this.food,
      node("quantity", "2"),
      node("unit-price", "£3.50"),
      node("modifier-count", "1"),
      node("modifier", "", [node("modifier-name", "No onion"), node("modifier-quantity", "1")]),
      node("line-notes", "Keep this with its extra"),
    ]);
    const unknownPrice = node("item", "", [
      node("name", "Extra drink"),
      node("quantity", "1"),
      node("modifier-count", "0"),
    ]);
    const button = (key, state) => {
      const result = node(key, key);
      result.onClick = () => {
        this.state.text = state;
        this.mutationClicks++;
      };
      return result;
    };
    this.itemCount = node("item-count", "2");
    this.order = node("order", "", [
      this.stableId,
      this.reference,
      this.state,
      this.fulfilment,
      this.payment,
      node("currency", "GBP"),
      node("total", "£14.50"),
      node("placed", new Date().toISOString()),
      node("notes", "Synthetic kitchen instruction"),
      this.itemCount,
      firstLine,
      unknownPrice,
      button("accept", "Accepted"),
      button("ready", "Ready"),
      button("handover", "Collected"),
    ]);
    this.orderCount = node("order-count", "1");
    this.root = node("root", "", [
      this.store,
      node("guard", "OFFLINE FIXTURE"),
      this.orderCount,
      this.order,
    ]);
  }
  all(scope = this.root) {
    return scope.children.flatMap((child) => [child, ...this.all(child)]);
  }
  key(selector) {
    if (selector.using === "id") return selector.value.replace(/^fixture:/, "");
    if (selector.using === "css") return /^\[data-key="([\w-]+)"\]$/.exec(selector.value)?.[1];
    throw new BridgeError("profile_mismatch");
  }
  async find(selector, scope = null) {
    return this.all(scope ?? this.root).filter((node) => node.key === this.key(selector));
  }
  async text(handle) {
    return handle.text;
  }
  async attribute(handle, name) {
    return handle.attributes?.[name] ?? null;
  }
  async click(handle) {
    handle.onClick?.();
  }
  async dispose() {}
  async close() {}
  async assertContext() {
    if (!this.contextAvailable) throw new BridgeError("session_required");
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
export function fixtureHtml(fixture) {
  const render = (node) => {
    const tag = node.onClick ? "button" : "div";
    return `<${tag} data-key="${escapeHtml(node.key)}">${escapeHtml(node.text)}${node.children.map(render).join("")}</${tag}>`;
  };
  return `<!doctype html><html><head><title>MealDeck offline connector fixture</title></head><body>
    <h1>Offline fixture — no merchant connection</h1>${render(fixture.root)}
    <script>document.addEventListener('click',event=>{const b=event.target.closest('button');if(!b)return;
    const next={accept:'Accepted',ready:'Ready',handover:'Collected'}[b.dataset.key];if(next)b.closest('[data-key="order"]').querySelector('[data-key="state"]').textContent=next;});</script>
    </body></html>`;
}

export async function startFixtureWeb(fixture) {
  const server = createServer((request, response) => {
    if (request.url !== "/fixture") {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(fixtureHtml(fixture));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    url: `http://127.0.0.1:${server.address().port}/fixture`,
    close: async () => {
      server.closeAllConnections();
      server.close();
      await once(server, "close");
    },
  };
}

export async function startFixtureAppium(fixture, { loseClickResponse = false } = {}) {
  const requests = [];
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, "http://127.0.0.1").pathname;
    requests.push({ method: request.method, path });
    let value;
    try {
      let raw = "";
      for await (const chunk of request) raw += chunk;
      const body = raw ? JSON.parse(raw) : {};
      if (path === "/session" && request.method === "POST")
        value = { sessionId: "fixture-session", capabilities: body.capabilities.alwaysMatch };
      else if (path === "/session/fixture-session" && request.method === "DELETE") value = null;
      else if (path.endsWith("/appium/device/current_package")) value = "uk.co.mealdeck.fixture";
      else {
        const match =
          /^\/session\/fixture-session(?:\/element\/([^/]+))?\/(elements|text|displayed|enabled|click|attribute\/(.+))$/.exec(
            path,
          );
        if (!match) throw new Error("fixture route");
        const element = match[1]
          ? fixture.all().find((node) => node.id === decodeURIComponent(match[1]))
          : null;
        if (match[1] && !element) throw new Error("fixture element");
        if (match[2] === "elements")
          value = (await fixture.find(body, element)).map((node) => ({
            "element-6066-11e4-a52e-4f735466cecf": node.id,
          }));
        else if (match[2] === "text") value = await fixture.text(element);
        else if (["displayed", "enabled"].includes(match[2])) value = true;
        else if (match[2] === "click") {
          await fixture.click(element);
          if (loseClickResponse) {
            loseClickResponse = false;
            response.destroy();
            return;
          }
          value = null;
        } else value = await fixture.attribute(element, decodeURIComponent(match[3]));
      }
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ value }));
    } catch {
      response.writeHead(500, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({ value: { error: "unknown error", message: "offline fixture" } }),
      );
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    requests,
    close: async () => {
      server.closeAllConnections();
      server.close();
      await once(server, "close");
    },
  };
}
