import { z } from "zod";

const envDefaults: Record<string, string> = {
  NODE_ENV: "development",
  PORT: "3001",
  AWS_REGION: "",
  AWS_ACCESS_KEY_ID: "",
  AWS_SECRET_ACCESS_KEY: "",
  NEO4J_URI: "",
  NEO4J_USERNAME: "",
  NEO4J_PASSWORD: "",
  DD_API_KEY: "",
  DD_SITE: "datadoghq.com",
  DD_LLMOBS_ENABLED: "1",
  DD_LLMOBS_ML_APP: "",
  DD_LLMOBS_AGENTLESS_ENABLED: "1",
  DD_TRACE_AWS_SDK_BEDROCKRUNTIME_ENABLED: "true",
  MINIMAX_API_KEY: "",
  MINIMAX_GROUP_ID: "",
  SKIP_NEO4J_CONNECTIVITY_CHECK: "0",
};

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]),
  PORT: z.coerce.number(),

  AWS_REGION: z.string(),
  AWS_ACCESS_KEY_ID: z.string(),
  AWS_SECRET_ACCESS_KEY: z.string(),

  NEO4J_URI: z.string(),
  NEO4J_USERNAME: z.string(),
  NEO4J_PASSWORD: z.string(),

  DD_API_KEY: z.string(),
  DD_SITE: z.string(),
  DD_LLMOBS_ENABLED: z.enum(["0", "1"]),
  DD_LLMOBS_ML_APP: z.string(),
  DD_LLMOBS_AGENTLESS_ENABLED: z.enum(["0", "1"]),
  DD_TRACE_AWS_SDK_BEDROCKRUNTIME_ENABLED: z.enum(["true", "false"]),

  MINIMAX_API_KEY: z.string(),
  MINIMAX_GROUP_ID: z.string(),

  SKIP_NEO4J_CONNECTIVITY_CHECK: z.enum(["0", "1"]),
});

const result = envSchema.safeParse({ ...envDefaults, ...process.env });

if (!result.success) {
  console.error("Environment validation failed:");
  console.error(result.error.format());
  process.exit(1);
}

export const config = result.data;
export type Config = typeof config;

export const BEDROCK_MODEL_ID = "anthropic.claude-3-sonnet-20240229-v1:0";

export function warnOnBlankConfig(keys: Array<keyof Config>, context: string): void {
  const blank = keys.filter((k) => config[k] === "" || config[k] === undefined);
  if (blank.length > 0) {
    console.warn(
      `[config] ${context}: missing values for ${blank.join(", ")} — features using these keys will fail at runtime`
    );
  }
}

export function requireConfigValues(keys: Array<keyof Config>, context: string): void {
  const blank = keys.filter((k) => config[k] === "" || config[k] === undefined);
  if (blank.length > 0) {
    throw new Error(`[config] ${context}: required values missing for ${blank.join(", ")}`);
  }
}
