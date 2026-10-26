import "server-only";

import { getContainer, type Container } from "@/server/container";
import { cardUrl, qrSvg } from "@/server/qr";
import { processSingleton } from "@/server/singleton";

import { AccountService } from "./account-service";
import { AdminAuditService } from "./admin/audit-query-service";
import { AdminCardService } from "./admin/card-admin-service";
import { AdminClientService } from "./admin/client-service";
import { AdminInboxService } from "./admin/inbox-service";
import { AdminIntegrationService } from "./admin/integration-service";
import { AdminOutboxService } from "./admin/outbox-service";
import { AdminOverviewService } from "./admin/overview-service";
import { AdminSettingsService } from "./admin/settings-service";
import { AdminStaffService } from "./admin/staff-service";
import { AdminTargetService } from "./admin/target-service";
import { AnalyticsService } from "./analytics-service";
import { CardService } from "./card-service";
import { EmployeeService } from "./employee-service";
import { LocationService } from "./location-service";
import { ReportService } from "./report-service";
import { SupportService } from "./support-service";
import { TeamService } from "./team-service";

/** Business logic on top of the container's interfaces; knows nothing about mocks. */
export function createServices(container: Container) {
  const { repositories, audit, clock } = container;
  const team = new TeamService(repositories, audit, clock);
  return {
    analytics: new AnalyticsService(repositories),
    cards: new CardService(repositories, audit, clock),
    locations: new LocationService(repositories, audit, clock),
    employees: new EmployeeService(repositories, audit),
    reports: new ReportService(repositories, audit),
    team,
    account: new AccountService(repositories, container.auth, audit),
    support: new SupportService(repositories, audit),
    admin: {
      overview: new AdminOverviewService(repositories, clock),
      clients: new AdminClientService(repositories, container.reviews, team, container.auth, audit, clock),
      cards: new AdminCardService(repositories, audit, cardUrl, qrSvg, clock),
      targets: new AdminTargetService(repositories, audit),
      integrations: new AdminIntegrationService(repositories, container.reviews, audit, clock),
      inbox: new AdminInboxService(repositories, audit),
      outbox: new AdminOutboxService(container.outbox, audit),
      staff: new AdminStaffService(repositories, container.auth, audit),
      audit: new AdminAuditService(repositories),
      settings: new AdminSettingsService(repositories, audit),
    },
  };
}

export type Services = ReturnType<typeof createServices>;

export function getServices(): Services {
  return processSingleton("services", () => createServices(getContainer()));
}
