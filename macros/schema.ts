import type { Empty, Macro } from "../core.ts";

// Generic schema validator type
export type SchemaValidator<T> = {
  validate: (data: unknown) => data is T;
  parse?: (data: unknown) => T; // For libraries like Zod that can parse and transform
};

// Generic schema metadata
export type SchemaMeta<T = unknown> = {
  schema?: {
    name: string;
    validator: SchemaValidator<T>;
    fetch?: () => Promise<unknown> | unknown; // Optional data fetcher
    transform?: (data: T) => unknown; // Optional post-validation transform
  };
};

// Type for the context added by schema macro
export type SchemaAdded<T = unknown> = {
  data: T;
  schemaName: string;
};

// Factory function to create a typed schema macro
export function createSchemaMacro<T>(): Macro<SchemaMeta<T>, Empty, SchemaAdded<T>> {
  return {
    name: "schema",
    match: (m) => !!m.schema,
    resolve: async (_base, meta) => {
      if (!meta.schema) {
        throw new Error("schema: missing schema configuration");
      }

      const { name, validator, fetch, transform } = meta.schema;

      // Fetch data if fetcher is provided
      let raw: unknown;
      if (fetch) {
        try {
          raw = await fetch();
        } catch (error) {
          throw new Error(`schema: failed to fetch data for ${name}: ${error}`);
        }
      } else {
        throw new Error(`schema: no data fetcher provided for ${name}`);
      }

      // Validate the data
      if (!validator.validate(raw)) {
        // Try parse if available (for Zod-like validators)
        if (validator.parse) {
          try {
            raw = validator.parse(raw);
          } catch (error) {
            throw new Error(`schema: validation failed for ${name}: ${error}`);
          }
        } else {
          throw new Error(`schema: validation failed for ${name}`);
        }
      }

      // Apply transformation if provided
      const data = transform ? transform(raw as T) : raw;

      return {
        data: data as T,
        schemaName: name,
      };
    },
  };
}

// Example validators for common types

// Person schema (backward compatible example)
export type Person = { id: number; name: string; age: number };

export const isPersonArray = (x: unknown): x is Person[] =>
  Array.isArray(x) &&
  x.every((r) =>
    typeof r === "object" &&
    r !== null &&
    "id" in r && typeof r.id === "number" &&
    "name" in r && typeof r.name === "string" &&
    "age" in r && typeof r.age === "number"
  );

export const personArrayValidator: SchemaValidator<Person[]> = {
  validate: isPersonArray,
};

// String array validator
export const isStringArray = (x: unknown): x is string[] =>
  Array.isArray(x) && x.every((item) => typeof item === "string");

export const stringArrayValidator: SchemaValidator<string[]> = {
  validate: isStringArray,
};

// Generic object validator
export const createObjectValidator = <T extends Record<string, unknown>>(
  shape: { [K in keyof T]: (value: unknown) => value is T[K] },
): SchemaValidator<T> => ({
  validate: (x: unknown): x is T => {
    if (typeof x !== "object" || x === null) return false;
    const obj = x as Record<string, unknown>;
    for (const [key, validator] of Object.entries(shape)) {
      if (!(key in obj) || !validator(obj[key])) {
        return false;
      }
    }
    return true;
  },
});

// Backward compatible schema macro for existing code
export const schemaMacro: Macro<{ schema?: "Person[]" }, Empty, { data: Person[] }> = {
  name: "schema",
  match: (m) => m.schema === "Person[]",
  resolve: () => {
    const rows = [{ id: 1, name: "Ada", age: 31 }, { id: 2, name: "Grace", age: 29 }];
    if (!isPersonArray(rows)) throw new Error("schema: invalid data");
    return { data: rows };
  },
};