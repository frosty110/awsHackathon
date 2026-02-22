type LogLevel = "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

type NormalizedError = {
  name: string;
  message: string;
  stack?: string;
  code?: string;
};

function normalizeError(error: unknown): NormalizedError | undefined {
  if (!error) return undefined;

  if (error instanceof Error) {
    const candidate = error as Error & { code?: string };
    return {
      name: candidate.name,
      message: candidate.message,
      stack: candidate.stack,
      code: candidate.code,
    };
  }

  if (typeof error === "object") {
    try {
      return {
        name: "NonErrorObject",
        message: JSON.stringify(error),
      };
    } catch {
      return {
        name: "NonErrorObject",
        message: "Failed to stringify non-error object",
      };
    }
  }

  return {
    name: "NonErrorValue",
    message: String(error),
  };
}

export function logEvent(
  level: LogLevel,
  event: string,
  context: LogContext = {},
  error?: unknown
): void {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...context,
    error: normalizeError(error),
  };
  const line = JSON.stringify(payload);

  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

const REQUEST_ID_RE = /^[a-zA-Z0-9\-_]{1,128}$/;

export function buildRequestId(headerValue: string | undefined): string {
  const trimmed = headerValue?.trim();
  return trimmed && REQUEST_ID_RE.test(trimmed) ? trimmed : crypto.randomUUID();
}
