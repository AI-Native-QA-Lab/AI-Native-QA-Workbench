const KEBAB_CASE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidKebabCaseId(value: unknown): value is string {
  return typeof value === "string" && KEBAB_CASE_ID_PATTERN.test(value);
}
