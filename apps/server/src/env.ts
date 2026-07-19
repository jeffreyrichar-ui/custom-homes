import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  PORT: z.coerce.number().int().positive().default(4000),
  ADMIN_TOKEN: z.string().min(1, "ADMIN_TOKEN is required"),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  JWT_SECRET: z
    .string()
    .min(16, "JWT_SECRET must be at least 16 chars")
    .default("dev-jwt-secret-please-change-me"),
  // BuilderTrend sync transport: checked-in fixtures until partner
  // credentials arrive, then flip to http.
  BT_SYNC_SOURCE: z.enum(["fixtures", "http"]).default("fixtures"),
  BT_API_BASE_URL: z.string().optional(),
  BT_API_KEY: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export type Dialect = "sqlite" | "postgres";

export function dialectFromUrl(url: string): Dialect {
  return url.startsWith("file:") || url.endsWith(".sqlite") ? "sqlite" : "postgres";
}

export const dialect: Dialect = dialectFromUrl(env.DATABASE_URL);
