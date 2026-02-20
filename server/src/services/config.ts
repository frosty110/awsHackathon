import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3001),

  AWS_REGION: z.string().min(1),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  BEDROCK_MODEL_ID: z.string().min(1),

  NEO4J_URI: z
    .string()
    .regex(
      /^(neo4j|neo4j\+s|bolt|bolt\+s):\/\//,
      "NEO4J_URI must start with neo4j://, neo4j+s://, bolt://, or bolt+s://"
    ),
  NEO4J_USERNAME: z.string().min(1),
  NEO4J_PASSWORD: z.string().min(1),

  DD_API_KEY: z.string().min(1),
  DD_SITE: z.string().min(1).default("datadoghq.com"),
  DD_LLMOBS_ENABLED: z.enum(["0", "1"]).default("1"),
  DD_LLMOBS_ML_APP: z.string().min(1),
  DD_LLMOBS_AGENTLESS_ENABLED: z.enum(["0", "1"]).default("1"),
  DD_TRACE_AWS_SDK_BEDROCKRUNTIME_ENABLED: z.enum(["true", "false"]).default("true"),

  MINIMAX_API_KEY: z.string().min(1),
  MINIMAX_GROUP_ID: z.string().min(1),

  SKIP_NEO4J_CONNECTIVITY_CHECK: z.enum(["0", "1"]).default("0")
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error("Environment validation failed:");
  console.error(result.error.format());
  process.exit(1);
}

export const config = result.data;
export type Config = typeof config;
