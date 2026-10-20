import { notFoundError } from "@/server/i18n";

import type {
  EmployeeRepository,
  LocationRepository,
  OrganizationRepository,
  RatingSnapshotRepository,
  RedirectTargetRepository,
} from "../organizations";
import { applyPatch, clone, cloneOrNull, inScope, requireRow, type MockContext } from "./context";

export function mockOrganizationRepository({ db, clock, newId }: MockContext): OrganizationRepository {
  return {
    async findById(id) {
      return cloneOrNull(db.organizations.find((o) => o.id === id));
    },
    async list(filter = {}) {
      const search = filter.search?.trim().toLowerCase();
      return clone(
        db.organizations
          .filter((o) => !filter.statuses || filter.statuses.includes(o.status))
          .filter(
            (o) =>
              !search ||
              o.name.toLowerCase().includes(search) ||
              o.legalName?.toLowerCase().includes(search) ||
              o.bin?.includes(search),
          )
          .sort((a, b) => a.name.localeCompare(b.name, "ru")),
      );
    },
    async listByIds(ids) {
      const wanted = new Set(ids);
      return clone(db.organizations.filter((o) => wanted.has(o.id)));
    },
    async createClient(input) {
      // Build every row first, then store them together: all or nothing.
      const createdAt = clock().toISOString();
      const organization = { ...clone(input.organization), id: newId(), createdAt };
      const locations = input.locations.map(({ location }) => ({
        ...clone(location),
        organizationId: organization.id,
        id: newId(),
        createdAt,
      }));
      const targets = input.locations.flatMap(({ reviewsTargetUrl }, index) => {
        const location = locations[index];
        return reviewsTargetUrl && location
          ? [
              {
                id: newId(),
                organizationId: organization.id,
                locationId: location.id,
                type: "TWOGIS_REVIEW" as const,
                url: reviewsTargetUrl,
                isVerified: true,
                createdAt,
              },
            ]
          : [];
      });
      db.organizations.push(organization);
      db.locations.push(...locations);
      db.targets.push(...targets);
      db.subscriptions.push({ ...clone(input.subscription), organizationId: organization.id });
      return { organization: clone(organization), locations: clone(locations) };
    },
    async update(id, patch) {
      const organization = requireRow(
        db.organizations.find((o) => o.id === id),
        "Organization",
      );
      return clone(applyPatch(organization, patch));
    },
  };
}

export function mockLocationRepository({ db, clock, newId }: MockContext): LocationRepository {
  const find = (id: string, scope?: { organizationId: string }) =>
    db.locations.find((l) => l.id === id && inScope(l, scope));

  return {
    async findById(id, scope) {
      return cloneOrNull(find(id, scope));
    },
    async list(filter = {}) {
      return clone(
        db.locations
          .filter((l) => !filter.organizationId || l.organizationId === filter.organizationId)
          .filter((l) => filter.isActive === undefined || l.isActive === filter.isActive),
      );
    },
    async create(input) {
      const location = { ...clone(input), id: newId(), createdAt: clock().toISOString() };
      db.locations.push(location);
      return clone(location);
    },
    async update(id, patch, scope) {
      return clone(applyPatch(requireRow(find(id, scope), "Location"), patch));
    },
  };
}

export function mockEmployeeRepository({ db, clock, newId }: MockContext): EmployeeRepository {
  const find = (id: string, scope?: { organizationId: string }) =>
    db.employees.find((e) => e.id === id && inScope(e, scope));

  return {
    async findById(id, scope) {
      return cloneOrNull(find(id, scope));
    },
    async list(filter = {}) {
      return clone(
        db.employees
          .filter((e) => !filter.organizationId || e.organizationId === filter.organizationId)
          .filter((e) => !filter.locationId || e.locationId === filter.locationId)
          .filter((e) => filter.isActive === undefined || e.isActive === filter.isActive)
          .sort((a, b) => a.name.localeCompare(b.name, "ru")),
      );
    },
    async create(input) {
      const employee = { ...clone(input), id: newId(), createdAt: clock().toISOString() };
      db.employees.push(employee);
      return clone(employee);
    },
    async update(id, patch, scope) {
      return clone(applyPatch(requireRow(find(id, scope), "Employee"), patch));
    },
    async delete(id, scope) {
      const index = db.employees.findIndex((e) => e.id === id && inScope(e, scope));
      if (index === -1) throw notFoundError("Employee");
      db.employees.splice(index, 1);
      // Mirrors ON DELETE SET NULL on cards.employee_id.
      for (const card of db.cards) {
        if (card.employeeId === id) card.employeeId = null;
      }
    },
  };
}

export function mockRedirectTargetRepository({ db, clock, newId }: MockContext): RedirectTargetRepository {
  const find = (id: string, scope?: { organizationId: string }) =>
    db.targets.find((t) => t.id === id && inScope(t, scope));

  return {
    async findById(id, scope) {
      return cloneOrNull(find(id, scope));
    },
    async list(filter = {}) {
      return clone(
        db.targets
          .filter((t) => !filter.organizationId || t.organizationId === filter.organizationId)
          .filter((t) => filter.isVerified === undefined || t.isVerified === filter.isVerified),
      );
    },
    async create(input) {
      const target = { ...clone(input), id: newId(), createdAt: clock().toISOString() };
      db.targets.push(target);
      return clone(target);
    },
    async update(id, patch, scope) {
      return clone(applyPatch(requireRow(find(id, scope), "RedirectTarget"), patch));
    },
  };
}

export function mockRatingSnapshotRepository({ db, newId }: MockContext): RatingSnapshotRepository {
  return {
    async list({ locationIds, range }) {
      const wanted = new Set(locationIds);
      return clone(
        db.ratingSnapshots
          .filter((s) => wanted.has(s.locationId))
          .filter((s) => !range || (s.capturedAt >= range.from && s.capturedAt < range.to))
          .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt)),
      );
    },
    async latestForLocations(locationIds) {
      const latest = new Map<string, (typeof db.ratingSnapshots)[number]>();
      const wanted = new Set(locationIds);
      for (const snapshot of db.ratingSnapshots) {
        if (!wanted.has(snapshot.locationId)) continue;
        const current = latest.get(snapshot.locationId);
        if (!current || snapshot.capturedAt > current.capturedAt) latest.set(snapshot.locationId, snapshot);
      }
      return clone([...latest.values()]);
    },
    async create(input) {
      const snapshot = { ...clone(input), id: newId() };
      db.ratingSnapshots.push(snapshot);
      return clone(snapshot);
    },
  };
}
