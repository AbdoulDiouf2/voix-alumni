import { z } from "zod";

export const healthSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("voix-alumni-api"),
});

export type HealthResponse = z.infer<typeof healthSchema>;

export const organizerRoleSchema = z.enum(["RESPONSABLE", "PRODUCTION"]);
export const organizerSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
  role: organizerRoleSchema,
});
export const dashboardSchema = z.object({
  role: organizerRoleSchema,
  status: z.literal("empty"),
  items: z.array(z.never()),
});

export type OrganizerRole = z.infer<typeof organizerRoleSchema>;
export type Organizer = z.infer<typeof organizerSchema>;
