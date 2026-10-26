import type { Employee } from "@/features/employees/schemas";
import type { Location, RatingSnapshot } from "@/features/locations/schemas";
import type { Organization, OrganizationStatus } from "@/features/organizations/schemas";
import type { RedirectTarget } from "@/features/targets/schemas";

import type { DateRange, NewEntity, OrgScope } from "./common";

export type OrganizationPatch = Partial<Omit<Organization, "id" | "createdAt">>;

export interface OrganizationRepository {
  findById(id: string): Promise<Organization | null>;
  list(filter?: { statuses?: OrganizationStatus[]; search?: string }): Promise<Organization[]>;
  listByIds(ids: readonly string[]): Promise<Organization[]>;
  /**
   * The "new client" wizard in ONE transaction: organization and its locations
   * (each optionally with a verified 2GIS reviews target).
   * Either everything is stored or nothing is.
   */
  createClient(input: NewClientInput): Promise<{ organization: Organization; locations: Location[] }>;
  update(id: string, patch: OrganizationPatch): Promise<Organization>;
}

export type NewClientInput = {
  organization: NewEntity<Organization>;
  locations: { location: Omit<NewEntity<Location>, "organizationId">; reviewsTargetUrl: string | null }[];
};

export type LocationPatch = Partial<Omit<Location, "id" | "organizationId" | "createdAt">>;

export interface LocationRepository {
  findById(id: string, scope?: OrgScope): Promise<Location | null>;
  list(filter?: { organizationId?: string; isActive?: boolean }): Promise<Location[]>;
  create(input: NewEntity<Location>): Promise<Location>;
  update(id: string, patch: LocationPatch, scope?: OrgScope): Promise<Location>;
}

export type EmployeePatch = Partial<Omit<Employee, "id" | "organizationId" | "createdAt">>;

export interface EmployeeRepository {
  findById(id: string, scope?: OrgScope): Promise<Employee | null>;
  list(filter?: { organizationId?: string; locationId?: string; isActive?: boolean }): Promise<Employee[]>;
  create(input: NewEntity<Employee>): Promise<Employee>;
  update(id: string, patch: EmployeePatch, scope?: OrgScope): Promise<Employee>;
  delete(id: string, scope?: OrgScope): Promise<void>;
}

export type RedirectTargetPatch = Partial<Pick<RedirectTarget, "locationId" | "type" | "url" | "isVerified">>;

export interface RedirectTargetRepository {
  findById(id: string, scope?: OrgScope): Promise<RedirectTarget | null>;
  list(filter?: { organizationId?: string; isVerified?: boolean }): Promise<RedirectTarget[]>;
  create(input: NewEntity<RedirectTarget>): Promise<RedirectTarget>;
  update(id: string, patch: RedirectTargetPatch, scope?: OrgScope): Promise<RedirectTarget>;
}

export interface RatingSnapshotRepository {
  /** Ordered by capturedAt ascending. `range` compares the UTC capture time. */
  list(filter: { locationIds: readonly string[]; range?: DateRange }): Promise<RatingSnapshot[]>;
  /** Latest snapshot per location (locations without snapshots are omitted). */
  latestForLocations(locationIds: readonly string[]): Promise<RatingSnapshot[]>;
  create(input: Omit<RatingSnapshot, "id">): Promise<RatingSnapshot>;
}
