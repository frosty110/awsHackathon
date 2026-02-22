/**
 * Shared input sanitization for user-facing text inputs.
 * Strips prompt injection patterns, control characters, and enforces length limits.
 */

// Patterns that could be used for Bedrock/Claude template injection
const INJECTION_PATTERNS = /\{\{|\}\}|<\||>\|/g;

// ASCII control characters (0x00-0x08) — excludes tab (0x09), newline (0x0A), carriage return (0x0D)
const CONTROL_CHARS = /[\x00-\x08]/g;

/**
 * Sanitize user input text before it reaches Bedrock or gets stored.
 * - Strips template injection patterns: {{ }} <| |>
 * - Strips dangerous control characters (0x00-0x08)
 * - Enforces max length
 * - Trims whitespace
 */
export function sanitizeUserInput(text: string, maxLength = 2000): string {
  return text
    .replace(INJECTION_PATTERNS, "")
    .replace(CONTROL_CHARS, "")
    .slice(0, maxLength)
    .trim();
}
