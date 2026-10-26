/**
 * Guards for rules that otherwise rely on discipline (spec section 10):
 * every page and route of the cabinet and the admin panel checks access on
 * the server, and every Server Action goes through the Zod → permission →
 * service pipeline. A new page without a guard fails this test.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("..", import.meta.url));

function filesUnder(dir: string, match: (name: string) => boolean): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && match(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

const rel = (file: string) => relative(SRC, file).replaceAll("\\", "/");

describe("server-side access checks", () => {
  const guarded = [join(SRC, "app", "(app)"), join(SRC, "app", "(admin)")].flatMap((dir) =>
    filesUnder(dir, (name) => name === "page.tsx" || name === "route.ts"),
  );
  const guard = /\b(requireOrgAccess|requirePlatformAccess|authorizeOrgAction|authorizePlatformAction)\(/;

  it("finds the cabinet and admin pages", () => {
    expect(guarded.length).toBeGreaterThan(25);
  });

  it.each(guarded.map((file) => [rel(file), file]))("%s checks access", (_name, file) => {
    expect(readFileSync(file, "utf8")).toMatch(guard);
  });

  it.each(guarded.map((file) => [rel(file), file]))(
    "%s goes through services, not repositories",
    (_name, file) => {
      expect(readFileSync(file, "utf8")).not.toMatch(/\brepositories\b/);
    },
  );
});

describe("Server Actions", () => {
  const actionFiles = filesUnder(join(SRC, "features"), (name) => name.endsWith(".ts")).filter((file) =>
    readFileSync(file, "utf8").startsWith('"use server"'),
  );
  /** Take no input and act only on the caller's own verified session. */
  const noInput = new Set(["signOutAction", "stopImpersonationAction"]);

  const actions = actionFiles.flatMap((file) => {
    const source = readFileSync(file, "utf8");
    return source
      .split(/\n(?=export )/)
      .filter((chunk) => chunk.startsWith("export async function"))
      .map((chunk) => ({
        name: /export async function (\w+)/.exec(chunk)?.[1] ?? "?",
        file: rel(file),
        body: chunk,
      }));
  });

  it("are all found", () => {
    expect(actions.length).toBeGreaterThan(40);
  });

  it.each(actions.map((a) => [`${a.file} › ${a.name}`, a]))(
    "%s validates and authorizes",
    (_name, action) => {
      if (noInput.has(action.name)) {
        expect(action.body).toMatch(/\((\s*)\)/);
        expect(action.body).toMatch(/authorizePlatformAction\(|cookies\(\)/);
        return;
      }
      // runOrgAction / runAdminAction = Zod + permission; runAction = Zod for public forms.
      expect(action.body).toMatch(/\brun(Org|Admin|Account)?Action\(/);
    },
  );

  it("only export functions (a schema exported from 'use server' breaks the build)", () => {
    for (const file of actionFiles) {
      const exports = readFileSync(file, "utf8").match(/^export (?!async function|type )\S+/gm) ?? [];
      expect(exports, rel(file)).toEqual([]);
    }
  });
});

describe("client-cabinet services", () => {
  const cabinetServices = [
    "account",
    "analytics",
    "card",
    "employee",
    "location",
    "report",
    "subscription",
    "support",
    "team",
  ].map((name) => join(SRC, "server", "services", `${name}-service.ts`));

  it.each(cabinetServices.map((file) => [rel(file), file]))(
    "%s reaches data only through forOrganization()",
    (_name, file) => {
      const source = readFileSync(file, "utf8");
      expect(source).toContain("forOrganization(this.repositories");
      // Direct repository access would bypass the organization filter. The one exception is
      // the caller's own profile (users), which is personal, not organization data.
      const direct = [...source.matchAll(/this\.repositories\.(\w+)/g)].map((m) => m[1]);
      expect(direct.filter((repo) => repo !== "users" || !file.endsWith("account-service.ts"))).toEqual([]);
    },
  );
});

describe("mocks stay behind the container", () => {
  it("are imported only by server/container.ts and tests", () => {
    const offenders = filesUnder(SRC, (name) => /\.(ts|tsx)$/.test(name))
      .filter((file) => !/\.test\.tsx?$/.test(file) && !file.includes(`${join("src", "mocks")}`))
      .filter((file) =>
        /from "@\/mocks|from "@\/server\/repositories\/mock|\/mock"/.test(readFileSync(file, "utf8")),
      )
      .map(rel)
      // The container wires them up; mock implementations may use each other.
      .filter((file) => file !== "server/container.ts" && !/\/mock(\/|\.ts$)/.test(file));
    expect(offenders).toEqual([]);
  });
});
