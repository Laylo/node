import { LayloConfigurationError } from "./errors.js";

/**
 * The Laylo account a call acts on: named by the API key that account gave
 * you, or, when the account sits under your own Laylo account, by its user id.
 * @see https://developers.laylo.com/authentication
 */
export type Customer =
  | {
      /** The customer's API key, sent as `X-Api-Key`. */
      apiKey: string;
      creatorId?: undefined;
    }
  | {
      /** The Laylo user id of an account on your roster, sent as `X-Creator-Id`. */
      creatorId: string;
      apiKey?: undefined;
    };

/** Anything a customer can be read out of: client options or per-call options. */
export interface CustomerFields {
  apiKey?: string | undefined;
  creatorId?: string | undefined;
}

const hasControlCharacter = (value: string): boolean => {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
};

const customerValue = (
  value: unknown,
  field: string,
  description: string,
): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new LayloConfigurationError(description);
  }
  // Sent verbatim as a header value, where fetch would otherwise reject a
  // control character with a TypeError rather than a LayloError.
  if (hasControlCharacter(value)) {
    throw new LayloConfigurationError(
      `${field} must not contain control characters`,
    );
  }
  return value;
};

/**
 * Reads the customer out of an options object. The API prefers the key when it
 * receives both, but a caller who set both almost certainly meant one of them,
 * so the SDK refuses rather than silently choose.
 * @param fields Options that may carry `apiKey` or `creatorId`.
 * @returns The customer named, or `undefined` when neither field is set.
 */
export const customerFrom = (fields: CustomerFields): Customer | undefined => {
  const { apiKey, creatorId } = fields;
  if (apiKey !== undefined && creatorId !== undefined) {
    throw new LayloConfigurationError(
      "Pass either apiKey or creatorId to name the customer, not both",
    );
  }
  if (apiKey !== undefined) {
    return {
      apiKey: customerValue(
        apiKey,
        "apiKey",
        "apiKey must be a non-empty customer API key",
      ),
    };
  }
  if (creatorId !== undefined) {
    return {
      creatorId: customerValue(
        creatorId,
        "creatorId",
        "creatorId must be a non-empty Laylo user id",
      ),
    };
  }
  return undefined;
};
