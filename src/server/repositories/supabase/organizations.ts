import "server-only";

import { employeeSchema } from "@/features/employees/schemas";
import { locationSchema, ratingSnapshotSchema } from "@/features/locations/schemas";
import { organizationSchema } from "@/features/organizations/schemas";
import { redirectTargetSchema } from "@/features/targets/schemas";
import { notFoundError } from "@/server/i18n";

import type {
  EmployeeRepository,
  LocationRepository,
  OrganizationRepository,
  RatingSnapshotRepository,
  RedirectTargetRepository,
} from "../organizations";
import {
  byName,
  chunk,
  escapeLike,
  fromRow,
  fromRows,
  ok,
  one,
  quote,
  readAll,
  rows,
  toRow,
  type DbGetter,
} from "./support";

export function supabaseOrganizationRepository(db: DbGetter): OrganizationRepository {
  return {
    async findById(id) {
      const c = await db();
      const data = ok(await c.from("organizations").select("*").eq("id", id).maybeSingle());
      return data ? fromRow(organizationSchema, data) : null;
    },
    async list(filter = {}) {
      const c = await db();
      const search = filter.search?.trim();
      const data = await readAll((from, to) => {
        let query = c.from("organizations").select("*");
        if (filter.statuses) query = query.in("status", filter.statuses);
        if (search) {
          const pattern = quote(`%${escapeLike(search)}%`);
          query = query.or(`name.ilike.${pattern},legal_name.ilike.${pattern},bin.like.${pattern}`);
        }
        return query.order("created_at").order("id").range(from, to);
      });
      return fromRows(organizationSchema, data).sort(byName);
    },
    async listByIds(ids) {
      const c = await db();
      const found = await Promise.all(
        chunk(ids).map(async (part) => rows(await c.from("organizations").select("*").in("id", part))),
      );
      return fromRows(organizationSchema, found.flat());
    },
    async createClient(input) {
      const c = await db();
      const organizationId = one(
        await c.rpc("create_client", {
          p_organization: {
            name: input.organization.name,
            legalName: input.organization.legalName,
            bin: input.organization.bin,
            contactName: input.organization.contactName,
            contactPhone: input.organization.contactPhone,
            contactEmail: input.organization.contactEmail,
            timezone: input.organization.timezone,
          },
          p_locations: input.locations.map(({ location, reviewsTargetUrl }) => ({
            name: location.name,
            address: location.address,
            twogisFirmId: location.twogisFirmId,
            twogisProfileUrl: location.twogisProfileUrl,
            reviewsTargetUrl,
          })),
          p_subscription: input.subscription,
        }),
      );
      const [organization, locations] = await Promise.all([
        one(await c.from("organizations").select("*").eq("id", organizationId).single()),
        rows(await c.from("locations").select("*").eq("organization_id", organizationId).order("created_at")),
      ]);
      return {
        organization: fromRow(organizationSchema, organization),
        locations: fromRows(locationSchema, locations),
      };
    },
    async update(id, patch) {
      const c = await db();
      const values = toRow(patch);
      const data = Object.keys(values).length
        ? ok(await c.from("organizations").update(values).eq("id", id).select().maybeSingle())
        : ok(await c.from("organizations").select("*").eq("id", id).maybeSingle());
      if (!data) throw notFoundError("Organization");
      return fromRow(organizationSchema, data);
    },
  };
}

export function supabaseLocationRepository(db: DbGetter): LocationRepository {
  return {
    async findById(id, scope) {
      const c = await db();
      let query = c.from("locations").select("*").eq("id", id);
      if (scope) query = query.eq("organization_id", scope.organizationId);
      const data = ok(await query.maybeSingle());
      return data ? fromRow(locationSchema, data) : null;
    },
    async list(filter = {}) {
      const c = await db();
      const data = await readAll((from, to) => {
        let query = c.from("locations").select("*");
        if (filter.organizationId) query = query.eq("organization_id", filter.organizationId);
        if (filter.isActive !== undefined) query = query.eq("is_active", filter.isActive);
        return query.order("created_at").order("id").range(from, to);
      });
      return fromRows(locationSchema, data);
    },
    async create(input) {
      const c = await db();
      return fromRow(locationSchema, one(await c.from("locations").insert(toRow(input)).select().single()));
    },
    async update(id, patch, scope) {
      const c = await db();
      const values = toRow(patch);
      // An empty patch changes nothing; PostgREST rejects an empty update, so just read the row.
      let query = Object.keys(values).length
        ? c.from("locations").update(values).select()
        : c.from("locations").select("*");
      query = query.eq("id", id);
      if (scope) query = query.eq("organization_id", scope.organizationId);
      const data = ok(await query.maybeSingle());
      if (!data) throw notFoundError("Location");
      return fromRow(locationSchema, data);
    },
  };
}

export function supabaseEmployeeRepository(db: DbGetter): EmployeeRepository {
  return {
    async findById(id, scope) {
      const c = await db();
      let query = c.from("employees").select("*").eq("id", id);
      if (scope) query = query.eq("organization_id", scope.organizationId);
      const data = ok(await query.maybeSingle());
      return data ? fromRow(employeeSchema, data) : null;
    },
    async list(filter = {}) {
      const c = await db();
      const data = await readAll((from, to) => {
        let query = c.from("employees").select("*");
        if (filter.organizationId) query = query.eq("organization_id", filter.organizationId);
        if (filter.locationId) query = query.eq("location_id", filter.locationId);
        if (filter.isActive !== undefined) query = query.eq("is_active", filter.isActive);
        return query.order("created_at").order("id").range(from, to);
      });
      return fromRows(employeeSchema, data).sort(byName);
    },
    async create(input) {
      const c = await db();
      return fromRow(employeeSchema, one(await c.from("employees").insert(toRow(input)).select().single()));
    },
    async update(id, patch, scope) {
      const c = await db();
      const values = toRow(patch);
      // An empty patch changes nothing; PostgREST rejects an empty update, so just read the row.
      let query = Object.keys(values).length
        ? c.from("employees").update(values).select()
        : c.from("employees").select("*");
      query = query.eq("id", id);
      if (scope) query = query.eq("organization_id", scope.organizationId);
      const data = ok(await query.maybeSingle());
      if (!data) throw notFoundError("Employee");
      return fromRow(employeeSchema, data);
    },
    async delete(id, scope) {
      const c = await db();
      let query = c.from("employees").delete().eq("id", id);
      if (scope) query = query.eq("organization_id", scope.organizationId);
      const deleted = ok(await query.select("id"));
      if (!deleted || deleted.length === 0) throw notFoundError("Employee");
    },
  };
}

export function supabaseRedirectTargetRepository(db: DbGetter): RedirectTargetRepository {
  return {
    async findById(id, scope) {
      const c = await db();
      let query = c.from("redirect_targets").select("*").eq("id", id);
      if (scope) query = query.eq("organization_id", scope.organizationId);
      const data = ok(await query.maybeSingle());
      return data ? fromRow(redirectTargetSchema, data) : null;
    },
    async list(filter = {}) {
      const c = await db();
      const data = await readAll((from, to) => {
        let query = c.from("redirect_targets").select("*");
        if (filter.organizationId) query = query.eq("organization_id", filter.organizationId);
        if (filter.isVerified !== undefined) query = query.eq("is_verified", filter.isVerified);
        return query.order("created_at").order("id").range(from, to);
      });
      return fromRows(redirectTargetSchema, data);
    },
    async create(input) {
      const c = await db();
      return fromRow(
        redirectTargetSchema,
        one(await c.from("redirect_targets").insert(toRow(input)).select().single()),
      );
    },
    async update(id, patch, scope) {
      const c = await db();
      const values = toRow(patch);
      // An empty patch changes nothing; PostgREST rejects an empty update, so just read the row.
      let query = Object.keys(values).length
        ? c.from("redirect_targets").update(values).select()
        : c.from("redirect_targets").select("*");
      query = query.eq("id", id);
      if (scope) query = query.eq("organization_id", scope.organizationId);
      const data = ok(await query.maybeSingle());
      if (!data) throw notFoundError("RedirectTarget");
      return fromRow(redirectTargetSchema, data);
    },
  };
}

export function supabaseRatingSnapshotRepository(db: DbGetter): RatingSnapshotRepository {
  return {
    async list({ locationIds, range }) {
      const c = await db();
      const parts = await Promise.all(
        chunk(locationIds).map((part) =>
          readAll((from, to) => {
            let query = c.from("rating_snapshots").select("*").in("location_id", part);
            if (range) query = query.gte("captured_at", range.from).lt("captured_at", range.to);
            return query.order("captured_at").order("id").range(from, to);
          }),
        ),
      );
      return fromRows(ratingSnapshotSchema, parts.flat()).sort((a, b) =>
        a.capturedAt.localeCompare(b.capturedAt),
      );
    },
    async latestForLocations(locationIds) {
      const c = await db();
      const parts = await Promise.all(
        chunk(locationIds).map(async (part) =>
          rows(await c.rpc("latest_rating_snapshots", { p_location_ids: part })),
        ),
      );
      return fromRows(ratingSnapshotSchema, parts.flat());
    },
    async create(input) {
      const c = await db();
      return fromRow(
        ratingSnapshotSchema,
        one(await c.from("rating_snapshots").insert(toRow(input)).select().single()),
      );
    },
  };
}
