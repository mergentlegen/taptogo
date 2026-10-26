import { beforeEach, describe, expect, it } from "vitest";

import { submitLeadSchema } from "@/features/leads/schemas";
import { createSeedData } from "@/mocks/seed";
import { createMockContainer, type Container } from "@/server/container";

import { createServices, type Services } from "./index";
import { LEAD_IP_RULE } from "./lead-service";

const NOW = new Date("2026-10-17T10:00:00Z");

let container: Container;
let services: Services;

beforeEach(() => {
  container = createMockContainer(createSeedData({ now: NOW }), () => NOW);
  services = createServices(container);
});

const lead = (phone = "+77019998877") => ({
  name: "Алия",
  phone,
  businessName: "Кофейня «Тест»",
  city: "Алматы",
  message: null,
});

describe("landing leads", () => {
  it("stores a NEW lead and writes the audit log; sends no e-mail", async () => {
    const created = await services.leads.submit(lead(), { ip: "203.0.113.5" });

    const stored = await container.repositories.leads.findById(created.id);
    expect(stored).toMatchObject({ status: "NEW", assigneeId: null, businessName: "Кофейня «Тест»" });
    const { items } = await container.repositories.auditLogs.list({ action: "lead.create" }, { limit: 10 });
    expect(items[0]).toMatchObject({ actorUserId: null, entityId: created.id });
    expect(container.outbox.list()).toEqual([]);
  });

  it("never stores the IP", async () => {
    const created = await services.leads.submit(lead(), { ip: "203.0.113.5" });
    expect(JSON.stringify(await container.repositories.leads.findById(created.id))).not.toContain(
      "203.0.113.5",
    );
  });

  it("rate-limits by IP and by phone", async () => {
    for (let i = 0; i < LEAD_IP_RULE.limit; i++) {
      await services.leads.submit(lead(`+7701000000${i}`), { ip: "203.0.113.7" });
    }
    await expect(services.leads.submit(lead("+77010000099"), { ip: "203.0.113.7" })).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });

    for (const ip of ["198.51.100.1", "198.51.100.2", "198.51.100.3"]) {
      await services.leads.submit(lead("+77015554433"), { ip });
    }
    await expect(services.leads.submit(lead("+77015554433"), { ip: "198.51.100.4" })).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });

  it("serves plans from platform settings", async () => {
    const settings = await container.repositories.platformSettings.get();
    expect(await services.leads.plans()).toEqual(settings.plans);
  });
});

describe("lead form schema", () => {
  const base = { name: "Алия", businessName: "Кофейня", city: "", message: "" };

  it.each([
    ["8 701 999 88 77", "+77019998877"],
    ["+7 (701) 999-88-77", "+77019998877"],
    ["77019998877", "+77019998877"],
  ])("normalizes the phone %s", (phone, expected) => {
    const parsed = submitLeadSchema.parse({ ...base, phone });
    expect(parsed).toMatchObject({ phone: expected, city: null, message: null });
  });

  it.each(["123", "+1 202 555 0100", "8 701 999 88"])("rejects the phone %s", (phone) => {
    expect(submitLeadSchema.safeParse({ ...base, phone }).success).toBe(false);
  });

  it("caps field lengths", () => {
    expect(
      submitLeadSchema.safeParse({ ...base, phone: "+77019998877", message: "x".repeat(2001) }).success,
    ).toBe(false);
  });
});
