import { LayloConfigurationError } from "./errors.js";

/**
 * Serializes request parameters into a query string the API understands.
 * `undefined` and `null` are skipped, arrays repeat the key, and primitives are
 * stringified. Objects are rejected: the few API parameters that take JSON in
 * the query string are sent pre-encoded by the methods that use them, never
 * through this helper.
 * @param params The parameters to serialize.
 * @returns The populated `URLSearchParams`.
 * @throws LayloConfigurationError When a value is an object.
 */
export const buildQuery = (
  params: Record<string, unknown>,
): URLSearchParams => {
  const query = new URLSearchParams();

  const append = (key: string, value: unknown) => {
    if (value === undefined || value === null) {
      return;
    }
    if (
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean"
    ) {
      throw new LayloConfigurationError(
        `Query parameter "${key}" must be a string, number, or boolean`,
      );
    }
    query.append(key, String(value));
  };

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        append(key, item);
      }
    } else {
      append(key, value);
    }
  }

  return query;
};
