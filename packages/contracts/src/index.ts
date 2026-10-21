import { z } from "zod";

export const healthSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("voix-alumni-api"),
});

export type HealthResponse = z.infer<typeof healthSchema>;
