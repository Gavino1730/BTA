type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const REDACTED = "[REDACTED]";
const REDACT_KEYS = new Set([
  "authorization",
  "x-api-key",
  "apikey",
  "api_key",
  "password",
  "token",
  "resettoken",
  "secret",
  "cookie",
  "set-cookie",
]);

const resolvedLevel = resolveLogLevel(process.env.BTA_LOG_LEVEL, process.env.NODE_ENV);

function resolveLogLevel(rawLevel: string | undefined, nodeEnv: string | undefined): LogLevel {
  const normalized = String(rawLevel ?? "").trim().toLowerCase();
  if (normalized === "debug" || normalized === "info" || normalized === "warn" || normalized === "error") {
    return normalized;
  }
  return nodeEnv === "production" ? "info" : "debug";
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[resolvedLevel];
}

function normalizeKey(key: string): string {
  return key.trim().toLowerCase();
}

function sanitizeValue(value: unknown): unknown {
  if (value == null) {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry));
  }

  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      output[key] = REDACT_KEYS.has(normalizeKey(key)) ? REDACTED : sanitizeValue(nestedValue);
    }
    return output;
  }

  return value;
}

function write(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  if (!shouldLog(level)) {
    return;
  }

  const payload: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    service: "realtime-api",
    message,
  };

  if (context && Object.keys(context).length > 0) {
    payload.context = sanitizeValue(context);
  }

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

export const logger = {
  debug(message: string, context?: Record<string, unknown>): void {
    write("debug", message, context);
  },
  info(message: string, context?: Record<string, unknown>): void {
    write("info", message, context);
  },
  warn(message: string, context?: Record<string, unknown>): void {
    write("warn", message, context);
  },
  error(message: string, context?: Record<string, unknown>): void {
    write("error", message, context);
  },
};
