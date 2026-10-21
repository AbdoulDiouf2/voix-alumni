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
  status: z.enum(["ready", "empty"]),
  items: z.array(
    z.object({
      id: z.string(),
      alumni_name: z.string(),
      public_number: z.number().nullable(),
      status: z.string(),
    }),
  ),
});

export type OrganizerRole = z.infer<typeof organizerRoleSchema>;
export type Organizer = z.infer<typeof organizerSchema>;

const optionalText = z.string().trim().max(4000).nullable().optional();
export const relationStatusSchema = z.enum([
  "brouillon",
  "a_contacter",
  "contacte",
  "interesse",
  "confirme",
  "a_relancer",
  "indisponible",
  "decline",
  "archive",
]);
export const alumniCreateSchema = z
  .object({
    full_name: z.string().trim().min(2).max(180),
    promotion_year: z
      .string()
      .regex(/^\d{4}$/)
      .nullable()
      .optional(),
    job_title: optionalText,
    company: optionalText,
    linkedin_url: z
      .url()
      .refine(
        (url) => url.startsWith("https://www.linkedin.com/"),
        "Lien LinkedIn HTTPS requis",
      )
      .nullable()
      .optional(),
    biography: optionalText,
    contact_notes: optionalText,
    source_ref: optionalText,
  })
  .strict();
export const alumniPatchSchema = alumniCreateSchema
  .partial()
  .extend({
    expected_version: z.number().int().positive(),
  })
  .strict();
export const contactEventSchema = z
  .object({
    status: relationStatusSchema.exclude(["brouillon", "archive"]),
    channel: z.enum(["email", "telephone", "linkedin", "autre"]).optional(),
    note: z.string().trim().max(500).optional(),
    expected_version: z.number().int().positive(),
  })
  .strict();
export const episodeStatusSchema = z.enum([
  "proposition",
  "a_confirmer",
  "confirme",
  "en_preparation",
  "reporte",
  "annule",
  "realise",
  "postproduction",
  "cloture",
]);
export const episodeCreateSchema = z
  .object({
    alumni_id: z.uuid(),
    title: z.string().trim().max(180).nullable().optional(),
    topic: z.string().trim().max(500).nullable().optional(),
    tentative_start_local: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
      .nullable()
      .optional(),
    event_timezone: z.string().max(100).nullable().optional(),
  })
  .strict();
export const episodePatchSchema = z
  .object({
    title: z.string().trim().max(180).nullable().optional(),
    topic: z.string().trim().max(500).nullable().optional(),
    tentative_start_local: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
      .nullable()
      .optional(),
    event_timezone: z.string().max(100).nullable().optional(),
    expected_version: z.number().int().positive(),
  })
  .strict();
export const scheduleActionSchema = z
  .object({
    start_at_local: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
    event_timezone: z.string().max(100),
    expected_version: z.number().int().positive(),
    reason: z.string().trim().min(3).max(500).optional(),
  })
  .strict();
export const mutationActionSchema = z
  .object({
    expected_version: z.number().int().positive(),
    reason: z.string().trim().min(3).max(500).optional(),
  })
  .strict();
export type AlumniCreate = z.infer<typeof alumniCreateSchema>;
export type EpisodeCreate = z.infer<typeof episodeCreateSchema>;
