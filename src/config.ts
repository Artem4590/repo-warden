import { z } from "zod";

const csv = z.string().default("").transform((value) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  GITHUB_WEBHOOK_SECRET: z.string().min(1),
  GITHUB_TRIGGER_MENTION: z.string().min(1).default("@openclaw"),
  GITHUB_ALLOWED_REPOS: csv,
  GITHUB_ALLOWED_SENDERS: csv,
  OPENCLAW_HOOK_URL: z.url(),
  OPENCLAW_HOOK_TOKEN: z.string().min(1),
  OPENCLAW_AGENT_ID: z.string().min(1).default("main"),
  OPENCLAW_SESSION_PREFIX: z.string().min(1).default("hook:github"),
  OPENCLAW_WAKE_MODE: z.enum(["now", "next-heartbeat"]).default("now"),
  OPENCLAW_DELIVER: z
    .string()
    .default("false")
    .transform((value) => value.toLowerCase() === "true"),
  OPENCLAW_TIMEOUT_SECONDS: z.coerce.number().int().positive().optional(),
  OPENCLAW_MODEL: z.string().optional(),
  OPENCLAW_THINKING: z.string().optional(),
  OPENCLAW_CHANNEL: z.string().optional(),
  OPENCLAW_TO: z.string().optional(),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return envSchema.parse(env);
}
