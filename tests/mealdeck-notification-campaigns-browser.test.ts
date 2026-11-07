import { describe, expect, test } from "bun:test";
import {
  canConfirmNotificationCampaign,
  parseNotificationCampaignResult,
  requestNotificationCampaigns,
} from "../src/lib/mealdeck-notification-campaigns-browser";

const campaign = {
  campaignId: "f29b6a5a-97a9-4acd-a9b7-632b7aa77f98",
  title: "A MealDeck offer",
  body: "Check the offers page for current terms.",
  path: "/offers" as const,
  expiresAt: "2026-11-07T18:00:00Z",
  status: "draft",
  eligibleDevices: 12,
  queued: 0,
  accepted: 0,
  failed: 0,
  skipped: 0,
};
const scope = {
  tenantId: "ee5f635d-202b-4722-b6b3-c6ce9f53c055",
  locationId: "eef4a110-5a19-4d0a-9c1e-ccdc75de43ac",
};

describe("marketing draft transport and reviewed send state", () => {
  test("the saved preview comes from validated server data, including the exact destination and expiry", () => {
    const parsed = parseNotificationCampaignResult("prepare", { available: true, ...campaign });
    expect(parsed.campaign).toEqual(campaign);
    expect(parsed.campaigns).toEqual([campaign]);
    expect(
      parseNotificationCampaignResult("list", { available: false, campaigns: [campaign] }),
    ).toEqual({ available: false, campaigns: [campaign], campaign: null });
  });

  test("unapproved paths, malformed counts, invalid expiry and missing readiness are rejected", () => {
    for (const invalid of [
      { ...campaign, path: "https://another-site.example" },
      { ...campaign, path: "/ops" },
      { ...campaign, eligibleDevices: -1 },
      { ...campaign, accepted: "12" },
      { ...campaign, expiresAt: "tomorrow" },
      { ...campaign, title: "a".repeat(61) },
      { ...campaign, body: "a".repeat(181) },
    ])
      expect(() =>
        parseNotificationCampaignResult("prepare", { available: true, ...invalid }),
      ).toThrow();
    expect(() => parseNotificationCampaignResult("list", { campaigns: [campaign] })).toThrow();
  });

  test("only a current nonempty draft can enable explicit sending", () => {
    const now = Date.parse("2026-11-07T12:00:00Z");
    expect(canConfirmNotificationCampaign(campaign, true, now)).toBe(true);
    expect(canConfirmNotificationCampaign(campaign, false, now)).toBe(false);
    expect(canConfirmNotificationCampaign({ ...campaign, eligibleDevices: 0 }, true, now)).toBe(
      false,
    );
    expect(canConfirmNotificationCampaign(campaign, true, Date.parse(campaign.expiresAt))).toBe(
      false,
    );
    for (const status of ["queued", "completed", "cancelled", "expired", "unknown-state"])
      expect(canConfirmNotificationCampaign({ ...campaign, status }, true, now)).toBe(false);
  });

  test("confirm submits the frozen campaign identifier without editable notification fields", async () => {
    let url: unknown;
    let sent: RequestInit | undefined;
    const request = (async (input: unknown, init?: RequestInit) => {
      url = input;
      sent = init;
      return Response.json({ available: true, ...campaign, status: "queued", queued: 12 });
    }) as typeof fetch;
    const result = await requestNotificationCampaigns(
      { ...scope, action: "confirm", campaignId: campaign.campaignId },
      async () => "verified-staff-bearer",
      undefined,
      request,
    );
    expect(url).toBe("/api/ops/notifications");
    expect(JSON.parse(String(sent?.body))).toEqual({
      ...scope,
      action: "confirm",
      campaignId: campaign.campaignId,
    });
    expect(new Headers(sent?.headers).get("Authorization")).toBe("Bearer verified-staff-bearer");
    expect(sent?.cache).toBe("no-store");
    expect(sent?.credentials).toBe("same-origin");
    expect(result.campaign?.status).toBe("queued");
    expect(result.campaign?.accepted).toBe(0);
  });

  test("missing staff identity or an aborted screen prevents the request", async () => {
    let requests = 0;
    const request = (async () => {
      requests += 1;
      return Response.json({});
    }) as typeof fetch;
    await expect(
      requestNotificationCampaigns(
        { ...scope, action: "list" },
        async () => null,
        undefined,
        request,
      ),
    ).rejects.toThrow("Sign in again");
    const controller = new AbortController();
    controller.abort();
    await expect(
      requestNotificationCampaigns(
        { ...scope, action: "list" },
        async () => "staff",
        controller.signal,
        request,
      ),
    ).rejects.toThrow("aborted");
    expect(requests).toBe(0);
  });

  test("a send failure remains a recoverable campaign error, never a fabricated sent count", async () => {
    const request = (async () =>
      Response.json(
        { message: "Refresh this campaign before trying again." },
        { status: 409 },
      )) as typeof fetch;
    await expect(
      requestNotificationCampaigns(
        { ...scope, action: "confirm", campaignId: campaign.campaignId },
        async () => "staff",
        undefined,
        request,
      ),
    ).rejects.toThrow("Refresh this campaign");
  });
});
