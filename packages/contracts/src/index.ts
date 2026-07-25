import { appEnvironmentSchema } from "@scouthub/config";
import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("scouthub-web"),
  environment: appEnvironmentSchema,
  timestamp: z.iso.datetime()
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
