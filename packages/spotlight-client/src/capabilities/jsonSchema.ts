type JsonSchema = Record<string, unknown>;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Browser-safe validator for the JSON Schema subset admitted by Capability v1.
 * Artifact admission remains the authority for validating schema documents.
 */
export function validateJsonSchemaValue(schema: JsonSchema, value: unknown): boolean {
  if (Array.isArray(schema.enum) && !schema.enum.some((entry) => Object.is(entry, value))) return false;
  if ("const" in schema && !Object.is(schema.const, value)) return false;

  switch (schema.type) {
    case "object": {
      if (!isObject(value)) return false;
      const properties = isObject(schema.properties) ? schema.properties : {};
      const required = Array.isArray(schema.required) ? schema.required : [];
      if (required.some((key) => typeof key !== "string" || !(key in value))) return false;
      if (schema.additionalProperties === false && Object.keys(value).some((key) => !(key in properties))) return false;
      return Object.entries(properties).every(([key, child]) =>
        !(key in value) || !isObject(child) || validateJsonSchemaValue(child, value[key]),
      );
    }
    case "array":
      return Array.isArray(value) && (!isObject(schema.items) || value.every((item) => validateJsonSchemaValue(schema.items as JsonSchema, item)));
    case "string":
      return typeof value === "string" &&
        (typeof schema.minLength !== "number" || value.length >= schema.minLength) &&
        (typeof schema.maxLength !== "number" || value.length <= schema.maxLength) &&
        (typeof schema.pattern !== "string" || new RegExp(schema.pattern).test(value));
    case "integer":
      return Number.isInteger(value) && (typeof schema.minimum !== "number" || (value as number) >= schema.minimum) && (typeof schema.maximum !== "number" || (value as number) <= schema.maximum);
    case "number":
      return typeof value === "number" && Number.isFinite(value) && (typeof schema.minimum !== "number" || value >= schema.minimum) && (typeof schema.maximum !== "number" || value <= schema.maximum);
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    default:
      return true;
  }
}
