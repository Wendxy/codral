const SECRET_PATTERNS: RegExp[] = [
  /ghp_[A-Za-z0-9]{30,}/g,
  /gho_[A-Za-z0-9]{30,}/g,
  /sk-[A-Za-z0-9]{20,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /(password|passwd|secret|api[_-]?key|token)\s*[:=]\s*['\"]?[^\s'\"]+['\"]?/gi
];

export function redactSecrets(input: string): string {
  let output = input;
  for (const pattern of SECRET_PATTERNS) {
    output = output.replace(pattern, "[REDACTED]");
  }
  return output;
}
