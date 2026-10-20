import type { Employee } from "@/features/employees/schemas";
import type { Period } from "@/lib/period";
import { serviceError } from "@/server/i18n";
import type { Repositories } from "@/server/repositories";
import { forOrganization } from "@/server/repositories/tenant";
import type { AuditService } from "@/server/services/audit-service";

import { assertOrgPermission, auditDiff, byKey, type OrgContext } from "./context";

export type EmployeeRow = Employee & {
  locationName: string | null;
  cardCount: number;
  taps: number;
  uniqueVisitors: number;
  /** 1-based place among employees with taps in the period; null without taps. */
  rank: number | null;
};

type EmployeeInput = {
  name: string;
  position: string | null;
  locationId: string | null;
  isActive: boolean;
};

export class EmployeeService {
  constructor(
    private readonly repositories: Repositories,
    private readonly audit: AuditService,
  ) {}

  private tenant(ctx: OrgContext) {
    return forOrganization(this.repositories, ctx.organizationId);
  }

  /** Employees with taps of their cards in the period, best first. */
  async list(ctx: OrgContext, period: Period): Promise<EmployeeRow[]> {
    const repos = this.tenant(ctx);
    const [employees, locations, cards, stats] = await Promise.all([
      repos.employees.list(),
      repos.locations.list(),
      repos.cards.list(),
      repos.dailyStats.totalsBy({ from: period.from, to: period.to }, "employeeId"),
    ]);
    const totals = byKey(stats);
    const locationName = new Map(locations.map((l) => [l.id, l.name]));
    const ranked = stats.filter((s) => s.taps > 0).sort((a, b) => b.taps - a.taps);
    const rank = new Map(ranked.map(({ key }, index) => [key, index + 1]));

    return employees
      .map((employee) => ({
        ...employee,
        locationName: employee.locationId ? (locationName.get(employee.locationId) ?? null) : null,
        cardCount: cards.filter((c) => c.employeeId === employee.id).length,
        taps: totals.get(employee.id)?.taps ?? 0,
        uniqueVisitors: totals.get(employee.id)?.uniqueVisitors ?? 0,
        rank: rank.get(employee.id) ?? null,
      }))
      .sort((a, b) => b.taps - a.taps || a.name.localeCompare(b.name, "ru"));
  }

  async create(ctx: OrgContext, input: EmployeeInput): Promise<Employee> {
    assertOrgPermission(ctx, "org.employees.manage");
    await this.assertLocation(ctx, input.locationId);
    const employee = await this.tenant(ctx).employees.create(input);
    await this.record(ctx, "employee.create", employee.id, null, { name: employee.name });
    return employee;
  }

  async update(ctx: OrgContext, employeeId: string, input: EmployeeInput): Promise<Employee> {
    assertOrgPermission(ctx, "org.employees.manage");
    const repos = this.tenant(ctx);
    const existing = await repos.employees.findById(employeeId);
    if (!existing) throw serviceError("NOT_FOUND", "employeeNotFound");
    await this.assertLocation(ctx, input.locationId);

    const updated = await repos.employees.update(employeeId, input);
    const diff = auditDiff(existing, updated, ["name", "position", "locationId", "isActive"]);
    if (diff) await this.record(ctx, "employee.update", employeeId, diff.before, diff.after);
    return updated;
  }

  /** Cards keep working; they just lose the employee link. */
  async delete(ctx: OrgContext, employeeId: string): Promise<void> {
    assertOrgPermission(ctx, "org.employees.manage");
    const repos = this.tenant(ctx);
    const existing = await repos.employees.findById(employeeId);
    if (!existing) throw serviceError("NOT_FOUND", "employeeNotFound");
    await repos.employees.delete(employeeId);
    await this.record(ctx, "employee.delete", employeeId, { name: existing.name }, null);
  }

  private async assertLocation(ctx: OrgContext, locationId: string | null) {
    if (!locationId) return;
    const location = await this.tenant(ctx).locations.findById(locationId);
    if (!location) throw serviceError("VALIDATION", "locationNotFound");
  }

  private record(
    ctx: OrgContext,
    action: string,
    entityId: string,
    before: Parameters<AuditService["record"]>[0]["before"],
    after: Parameters<AuditService["record"]>[0]["after"],
  ) {
    return this.audit.record({
      actorUserId: ctx.userId,
      action,
      entityType: "employee",
      entityId,
      organizationId: ctx.organizationId,
      before,
      after,
    });
  }
}
