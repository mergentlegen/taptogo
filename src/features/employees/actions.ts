"use server";

import type { ActionResult } from "@/server/actions";
import { runOrgAction } from "@/server/org-action";
import { getServices } from "@/server/services";

import {
  createEmployeeSchema,
  deleteEmployeeSchema,
  updateEmployeeSchema,
  type EmployeeFormInput,
} from "./form-schemas";

export async function createEmployeeAction(input: EmployeeFormInput): Promise<ActionResult> {
  return runOrgAction("org.employees.manage", createEmployeeSchema, input, async (ctx, data) => {
    await getServices().employees.create(ctx, data);
    return null;
  });
}

export async function updateEmployeeAction(
  input: EmployeeFormInput & { employeeId: string },
): Promise<ActionResult> {
  return runOrgAction(
    "org.employees.manage",
    updateEmployeeSchema,
    input,
    async (ctx, { employeeId, ...data }) => {
      await getServices().employees.update(ctx, employeeId, data);
      return null;
    },
  );
}

export async function deleteEmployeeAction(input: { employeeId: string }): Promise<ActionResult> {
  return runOrgAction("org.employees.manage", deleteEmployeeSchema, input, async (ctx, { employeeId }) => {
    await getServices().employees.delete(ctx, employeeId);
    return null;
  });
}
