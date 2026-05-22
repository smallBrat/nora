export function readFieldValue(source: any, key: string) {
  return key.split(".").reduce((acc, part) => (acc == null ? undefined : acc[part]), source);
}

export function normalizeFieldValue(field: any, value: any) {
  if (field.type === "checkbox") return Boolean(value ?? field.defaultValue ?? false);
  if (field.type === "number") {
    if (value == null || value === "") return "";
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : "";
  }
  if (field.type === "password") return "";
  return value ?? field.defaultValue ?? "";
}

export function buildInitialValues(source: any, configFields: any[]) {
  return (configFields || []).reduce(
    (acc, field) => {
      acc[field.key] = normalizeFieldValue(field, readFieldValue(source || {}, field.key));
      return acc;
    },
    {} as Record<string, any>,
  );
}

function matchesCondition(expected: any, actual: any) {
  if (Array.isArray(expected)) return expected.includes(actual);
  return actual === expected;
}

export function isFieldVisible(field: any, values: Record<string, any>) {
  const rules = field?.visibleWhen;
  if (!rules || typeof rules !== "object") return true;
  return Object.entries(rules).every(([key, expected]) =>
    matchesCondition(expected, values[key] ?? readFieldValue(values, key)),
  );
}

export function partitionVisibleFields(
  fields: any[],
  values: Record<string, any>,
  options: { advancedKeys?: Set<string> } = {},
) {
  const advancedKeys = options.advancedKeys || new Set<string>();
  const visibleFields = (fields || []).filter((field) => isFieldVisible(field, values));
  const basicFields = visibleFields.filter(
    (field) => field.section !== "advanced" && !advancedKeys.has(field.key),
  );
  const advancedFields = visibleFields.filter(
    (field) => field.section === "advanced" || advancedKeys.has(field.key),
  );
  return { basicFields, advancedFields };
}
