import { beforeEach, describe, expect, it } from "vitest";

import type { Card } from "@/features/cards/schemas";
import { createSeedData } from "@/mocks/seed";
import { createMockContainer } from "@/server/container";
import type { Repositories } from "@/server/repositories";

import { CardRedirectService } from "./card-redirect-service";

const NOW = new Date("2026-10-17T10:00:00Z");

let repos: Repositories;
let service: CardRedirectService;

beforeEach(() => {
  repos = createMockContainer(createSeedData({ now: NOW }), () => NOW).repositories;
  service = new CardRedirectService(repos);
});

async function cardWith(status: Card["status"]): Promise<Card> {
  const [card] = await repos.cards.list({ statuses: [status] });
  if (!card) throw new Error(`no ${status} card in seed`);
  return card;
}

describe("CardRedirectService", () => {
  it("redirects an active card to its verified target", async () => {
    const card = await cardWith("ACTIVE");
    const target = await repos.targets.findById(card.targetId ?? "");
    const decision = await service.resolve(card.code);

    expect(decision).toMatchObject({ kind: "REDIRECT", url: target?.url, timeZone: "Asia/Almaty" });
    if (decision.kind === "REDIRECT") expect(decision.card.organizationId).toBe(card.organizationId);
  });

  it.each(["abc", "abcdefghi", "abcd-efg", "../../etc", "AAAAAAA%"])(
    "rejects malformed code %j",
    async (code) => {
      expect(await service.resolve(code)).toEqual({ kind: "NOT_FOUND" });
    },
  );

  it("returns NOT_FOUND for unknown and case-mismatched codes", async () => {
    const card = await cardWith("ACTIVE");
    const flipped = [...card.code]
      .map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()))
      .join("");

    expect(await service.resolve("ZZZZZZZZ")).toEqual({ kind: "NOT_FOUND" });
    if (flipped !== card.code) expect(await service.resolve(flipped)).toEqual({ kind: "NOT_FOUND" });
  });

  it("shows 'not activated' for unassigned cards", async () => {
    expect(await service.resolve((await cardWith("UNASSIGNED")).code)).toEqual({ kind: "NOT_ACTIVATED" });
  });

  it.each(["PAUSED", "LOST", "REVOKED"] as const)("hides %s cards behind a neutral page", async (status) => {
    expect(await service.resolve((await cardWith(status)).code)).toEqual({ kind: "INACTIVE" });
  });

  it("deactivates the redirect as soon as a card is reported lost", async () => {
    const card = await cardWith("ACTIVE");
    await repos.cards.update(card.id, { status: "LOST" });
    expect(await service.resolve(card.code)).toEqual({ kind: "INACTIVE" });
  });

  it("refuses unverified targets and targets of another organization", async () => {
    const card = await cardWith("ACTIVE");
    await repos.targets.update(card.targetId ?? "", { isVerified: false });
    expect(await service.resolve(card.code)).toEqual({ kind: "INACTIVE" });

    const foreign = (await repos.targets.list()).find((t) => t.organizationId !== card.organizationId);
    await repos.cards.update(card.id, { targetId: foreign?.id ?? null });
    expect(await service.resolve(card.code)).toEqual({ kind: "INACTIVE" });
  });

  it("stops redirecting when the target's domain leaves the allowlist", async () => {
    const card = await cardWith("ACTIVE");
    await repos.platformSettings.update({ allowedRedirectDomains: ["google.com"] });
    expect(await service.resolve(card.code)).toEqual({ kind: "INACTIVE" });
  });

  it("stops redirecting for an archived client", async () => {
    const card = await cardWith("ACTIVE");
    expect((await service.resolve(card.code)).kind).toBe("REDIRECT");

    await repos.organizations.update(card.organizationId ?? "", { status: "ARCHIVED" });
    expect(await service.resolve(card.code)).toEqual({ kind: "INACTIVE" });
  });
});
