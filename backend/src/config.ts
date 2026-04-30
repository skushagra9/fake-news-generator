import { z } from "zod";

// Validate process.env at boot. Fail-fast beats discovering at request time
// that DATABASE_URL is missing.
const Env = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  CORS_ORIGIN: z.string().default("*"),
});

const parsed = Env.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Invalid environment:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
