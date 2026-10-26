import type { User, UserStatus } from "@/features/users/schemas";
import type { AuthService } from "@/server/auth/types";
import { serviceError } from "@/server/i18n";
import type { Repositories } from "@/server/repositories";
import type { AuditService } from "@/server/services/audit-service";

import { assertAdmin, type AdminContext } from "./context";

/** TapToGo administrators. */
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
  async create(ctx: AdminContext, input: { email: string; name: string }): Promise<User> {
    assertAdmin(ctx, "admin.staff.manage");
    if (await this.repositories.users.findByEmail(input.email)) throw serviceError("CONFLICT", "userExists");
    const user = await this.repositories.users.create({
      email: input.email,
      name: input.name,
      phone: null,
      platformRole: "ADMIN",
      status: "ACTIVE",
      totpEnabled: false,
      mustChangePassword: false,
      lastLoginAt: null,
    });
    await this.auth.requestPasswordReset(user.email, { ip: `staff-invite:${ctx.userId}`, userAgent: null });
    await this.audit.record({
      actorUserId: ctx.userId,
      action: "staff.create",
      entityType: "user",
      entityId: user.id,
      after: { email: user.email },
    });
    return user;
  }

  /** Blocking ends all their sessions at the next request (sessions require an ACTIVE user). */
  async setStatus(ctx: AdminContext, userId: string, status: Extract<UserStatus, "ACTIVE" | "BLOCKED">) {
    assertAdmin(ctx, "admin.staff.manage");
    const user = await this.requireStaff(ctx, userId);
    if (user.status === status) return;
    if (status === "BLOCKED") await this.assertAnotherAdmin(userId);
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

  /** Someone must always be able to sign in to the admin panel. */
  private async assertAnotherAdmin(leavingUserId: string) {
    const staff = await this.repositories.users.listPlatformStaff();
    if (!staff.some((u) => u.id !== leavingUserId && u.status === "ACTIVE")) {
      throw serviceError("CONFLICT", "lastAdmin");
    }
  }
}
