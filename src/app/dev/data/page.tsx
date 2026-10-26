import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { addDays, DEFAULT_TIME_ZONE, toLocalDate } from "@/lib/dates";
import { getContainer } from "@/server/container";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dev.data");
  return { title: t("title") };
}

const numberFormat = new Intl.NumberFormat("ru-RU");
const dateTimeFormat = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: DEFAULT_TIME_ZONE,
});

/** Read-only overview of the seeded mock data, for checking stage 2 by hand. */
export default async function DevDataPage() {
  const t = await getTranslations("dev.data");
  const { repositories: repos, clock, demo } = getContainer();
  const now = clock();
  const today = toLocalDate(now, DEFAULT_TIME_ZONE);
  const everything = { from: "2000-01-01T00:00:00Z", to: now.toISOString() };

  const [organizations, locations, employees, cards, batches, taps, stats, lastTaps] = await Promise.all([
    repos.organizations.list(),
    repos.locations.list(),
    repos.employees.list(),
    repos.cards.list(),
    repos.batches.list(),
    Promise.all(
      (["valid", "bots", "duplicates"] as const).map((kind) =>
        repos.tapEvents.count({ range: everything, kind }),
      ),
    ),
    repos.dailyStats.totalsBy({ from: addDays(today, -29), to: today }, "organizationId"),
    repos.tapEvents.lastTapByCard({}),
  ]);
  const [validTaps = 0, bots = 0, duplicates = 0] = taps;
  const taps30 = new Map(stats.map((s) => [s.key, s.taps]));
  const [snapshots, staff] = await Promise.all([
    repos.ratingSnapshots.list({ locationIds: locations.map((l) => l.id) }),
    repos.users.listPlatformStaff(),
  ]);
  const daysWithTaps = (await repos.dailyStats.totalsBy({ from: "2000-01-01", to: today }, "date")).length;
  const memberCount = (
    await Promise.all(organizations.map((o) => repos.memberships.listByOrganization(o.id)))
  ).flat();
  const userCount = new Set([...staff.map((u) => u.id), ...memberCount.map((m) => m.userId)]).size;

  const orgName = new Map(organizations.map((o) => [o.id, o.name]));
  const countLabels = {
    organizations: t("counts.organizations"),
    locations: t("counts.locations"),
    employees: t("counts.employees"),
    cards: t("counts.cards"),
    batches: t("counts.batches"),
    users: t("counts.users"),
    validTaps: t("counts.validTaps"),
    bots: t("counts.bots"),
    duplicates: t("counts.duplicates"),
    dailyStats: t("counts.dailyStats"),
    ratingSnapshots: t("counts.ratingSnapshots"),
  };
  const counts: [keyof typeof countLabels, number][] = [
    ["organizations", organizations.length],
    ["locations", locations.length],
    ["employees", employees.length],
    ["cards", cards.length],
    ["batches", batches.length],
    ["users", userCount],
    ["validTaps", validTaps],
    ["bots", bots],
    ["duplicates", duplicates],
    ["dailyStats", daysWithTaps],
    ["ratingSnapshots", snapshots.length],
  ];

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {counts.map(([key, value]) => (
          <Card key={key} className="gap-1 py-4">
            <CardContent className="px-4">
              <p className="text-xs text-muted-foreground">{countLabels[key]}</p>
              <p className="text-xl font-semibold tabular-nums">{numberFormat.format(value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Section title={t("organizationsTitle")}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.name")}</TableHead>
              <TableHead>{t("columns.status")}</TableHead>
              <TableHead className="text-right">{t("columns.locations")}</TableHead>
              <TableHead className="text-right">{t("columns.cards")}</TableHead>
              <TableHead className="text-right">{t("columns.taps30")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {organizations.map((org) => {
              const taps = taps30.get(org.id) ?? 0;
              return (
                <TableRow key={org.id}>
                  <TableCell className="font-medium">{org.name}</TableCell>
                  <TableCell>{org.status}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {locations.filter((l) => l.organizationId === org.id).length}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {cards.filter((c) => c.organizationId === org.id).length}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{numberFormat.format(taps)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Section>

      {demo && (
        <Section title={t("accountsTitle")} hint={t("accountsHint", { password: demo.password })}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.email")}</TableHead>
                <TableHead>{t("columns.role")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {demo.accounts.map((account) => (
                <TableRow key={account.email}>
                  <TableCell className="font-mono text-xs">{account.email}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{account.role}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
      )}

      <Section title={t("cardsTitle")} hint={t("cardsHint")}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.code")}</TableHead>
              <TableHead>{t("columns.organization")}</TableHead>
              <TableHead>{t("columns.label")}</TableHead>
              <TableHead>{t("columns.cardStatus")}</TableHead>
              <TableHead>{t("columns.lastTap")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cards.map((card) => {
              const lastTap = lastTaps[card.id];
              return (
                <TableRow key={card.id}>
                  <TableCell>
                    <span className="font-mono">{card.code}</span>{" "}
                    <a href={`/t/${card.code}`} className="text-xs text-primary underline underline-offset-2">
                      NFC
                    </a>{" "}
                    <a
                      href={`/t/${card.code}?s=q`}
                      className="text-xs text-primary underline underline-offset-2"
                    >
                      QR
                    </a>
                  </TableCell>
                  <TableCell>{card.organizationId ? orgName.get(card.organizationId) : t("none")}</TableCell>
                  <TableCell>{card.label}</TableCell>
                  <TableCell>
                    <Badge variant={card.status === "ACTIVE" ? "default" : "outline"}>{card.status}</Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {lastTap ? dateTimeFormat.format(new Date(lastTap)) : t("none")}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Section>
    </>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
