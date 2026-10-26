import type { PlatformSettings } from "@/features/platform/schemas";
import type { Repositories } from "@/server/repositories";
import type { AuditService } from "@/server/services/audit-service";

import { assertAdmin, type AdminContext } from "./context";

/** Allowlist, grace period and plans — administrators only, every change audited. */
export class AdminSettingsService {
  constructor(
    private readonly repositories: Repositories,
    private readonly audit: AuditService,
  ) {}

  get(): Promise<PlatformSettings> {
    return this.repositories.platformSettings.get();
  }

  async update(ctx: AdminContext, next: PlatformSettings): Promise<PlatformSettings> {
    assertAdmin(ctx, "admin.settings.manage");
    const before = await this.repositories.platformSettings.get();
    const after = await this.repositories.platformSettings.update({
      ...next,
      allowedRedirectDomains: [...new Set(next.allowedRedirectDomains.map((d) => d.toLowerCase()))],
    });
    await this.audit.record({
      actorUserId: ctx.userId,
      action: "settings.update",
      entityType: "settings",
      entityId: "platform",
      before,
      after,
    });
    return after;
  }
}
