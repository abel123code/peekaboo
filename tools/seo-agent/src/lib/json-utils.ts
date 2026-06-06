export function assertString(value: unknown, fieldName: string): asserts value is string {
  if (!value || typeof value !== "string") {
    throw new Error(`Expected "${fieldName}" to be a non-empty string.`);
  }
}

export function slugify(value: string): string {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
