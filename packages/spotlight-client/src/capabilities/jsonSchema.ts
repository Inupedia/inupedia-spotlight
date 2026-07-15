export function validateJsonSchemaV1(schema: Record<string, unknown>, value: unknown, path = "$" ): string | undefined {
  const type = schema.type;
  if (typeof type === "string") {
    const valid = type === "object" ? value !== null && typeof value === "object" && !Array.isArray(value)
      : type === "array" ? Array.isArray(value)
      : type === "integer" ? Number.isInteger(value)
      : type === "number" ? typeof value === "number" && Number.isFinite(value)
      : type === "string" ? typeof value === "string"
      : type === "boolean" ? typeof value === "boolean"
      : type === "null" ? value === null : true;
    if (!valid) return `${path} must be ${type}`;
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((entry) => jsonEqual(entry, value))) return `${path} is not an allowed value`;
  if ("const" in schema && !jsonEqual(schema.const, value)) return `${path} must equal const`;
  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) return `${path} is shorter than minLength`;
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) return `${path} is longer than maxLength`;
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) return `${path} does not match pattern`;
  }
  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) return `${path} is below minimum`;
    if (typeof schema.maximum === "number" && value > schema.maximum) return `${path} is above maximum`;
  }
  if (schema.type === "object" && value !== null && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const required of Array.isArray(schema.required) ? schema.required : []) {
      if (typeof required === "string" && !(required in record)) return `${path}.${required} is required`;
    }
    const properties = schema.properties && typeof schema.properties === "object" ? schema.properties as Record<string, unknown> : {};
    if (schema.additionalProperties === false) {
      const unknown = Object.keys(record).find((key) => !(key in properties));
      if (unknown) return `${path}.${unknown} is not allowed`;
    }
    for (const [key, child] of Object.entries(properties)) {
      if (key in record && child && typeof child === "object" && !Array.isArray(child)) {
        const error = validateJsonSchemaV1(child as Record<string, unknown>, record[key], `${path}.${key}`);
        if (error) return error;
      }
    }
  }
  if (schema.type === "array" && Array.isArray(value) && schema.items && typeof schema.items === "object" && !Array.isArray(schema.items)) {
    for (let index = 0; index < value.length; index += 1) {
      const error = validateJsonSchemaV1(schema.items as Record<string, unknown>, value[index], `${path}[${index}]`);
      if (error) return error;
    }
  }
  return undefined;
}

function jsonEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((entry, index) => jsonEqual(entry, right[index]));
  if (left && right && typeof left === "object" && typeof right === "object") {
    const a = left as Record<string, unknown>; const b = right as Record<string, unknown>;
    const keys = Object.keys(a); return keys.length === Object.keys(b).length && keys.every((key) => key in b && jsonEqual(a[key], b[key]));
  }
  return false;
}
