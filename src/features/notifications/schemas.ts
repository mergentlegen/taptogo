import { z } from "zod";

import { idSchema } from "@/lib/schemas";

/** Per user and organization: a person in two organizations chooses separately for each. */
export const notificationSettingSchema = z.object({
  userId: idSchema,
  organizationId: idSchema,
  weeklyReportEmail: z.boolean(),
  lowActivityAlert: z.boolean(),
});
export type NotificationSetting = z.infer<typeof notificationSettingSchema>;
