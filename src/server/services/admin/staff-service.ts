import type { PlatformRole, User, UserStatus } from "@/features/users/schemas";
import type { AuthService } from "@/server/auth/types";
import { serviceError } from "@/server/i18n";
import type { Repositories } from "@/server/repositories";
import type { AuditService } from "@/server/services/audit-service";

import { assertAdmin, type AdminContext } from "./context";

/** TapToGo staff accounts (SUPER_ADMIN only). */
export class AdminStaffService {
  constructor(
    private readonly repositories: Repositories,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  list(): Promise<User[]> {
    return this.repositories.users.listPlatformStaff();
  }

  /**
   * Creates the account without a password and emails a one-time link to set
   * one (the regular password-reset flow), so no password ever travels.
   */
  async create(ctx: AdminContext, input: { email: string; name: string; role: PlatformRole }): Promise<User> {
    assertAdmin(ctx, "admin.staff.manage");
    if (await this.repositories.users.findByEmail(input.email)) throw serviceError("CONFLICT", "userExists");
    const user = await this.repositories.users.create({
      email: input.email,
      name: input.name,
      phone: null,
      platformRole: input.role,
      status: "ACTIVE",
      totpEnabled: false,
      lastLoginAt: null,
    });
    await this.auth.requestPasswordReset(user.email, { ip: `staff-invite:${ctx.userId}`, userAgent: null });
    await this.audit.record({
      actorUserId: ctx.userId,
      action: "staff.create",
      entityType: "user",
      entityId: user.id,
      after: { email: user.email, role: input.role },
    });
    return user;
  }

  async setRole(ctx: AdminContext, userId: string, role: PlatformRole): Promise<void> {
    assertAdmin(ctx, "admin.staff.manage");
    const user = await this.requireStaff(ctx, userId);
    if (user.platformRole === role) return;
    if (user.platformRole === "SUPER_ADMIN") await this.assertAnotherSuperAdmin(userId);
    await this.repositories.users.update(userId, { platformRole: role });
    await this.audit.record({
      actorUserId: ctx.userId,
      action: "staff.role_change",
      entityType: "user",
      entityId: userId,
      before: { role: user.platformRole },
      after: { role },
    });
  }

  /** Blocking ends all their sessions at the next request (sessions require an ACTIVE user). */
  async setStatus(ctx: AdminContext, userId: string, status: Extract<UserStatus, "ACTIVE" | "BLOCKED">) {
    assertAdmin(ctx, "admin.staff.manage");
    const user = await this.requireStaff(ctx, userId);
    if (user.status === status) return;
    if (status === "BLOCKED" && user.platformRole === "SUPER_ADMIN")
      await this.assertAnotherSuperAdmin(userId);
    await this.repositories.users.update(userId, { status });
    await this.audit.record({
      actorUserId: ctx.userId,
      action: status === "BLOCKED" ? "staff.block" : "staff.unblock",
      entityType: "user",
      entityId: userId,
      before: { status: user.status },
      after: { status },
    });
  }

  private async requireStaff(ctx: AdminContext, userId: string): Promise<User> {
    if (userId === ctx.userId) throw serviceError("CONFLICT", "cannotChangeSelf");
    const user = await this.repositories.users.findById(userId);
    if (!user?.platformRole) throw serviceError("NOT_FOUND", "staffNotFound");
    return user;
  }

  private async assertAnotherSuperAdmin(leavingUserId: string) {
    const staff = await this.repositories.users.listPlatformStaff();
    if (
      !staff.some((u) => u.id !== leavingUserId && u.platformRole === "SUPER_ADMIN" && u.status === "ACTIVE")
    ) {
      throw serviceError("CONFLICT", "lastSuperAdmin");
    }
  }
}
