import { LayloConfigurationError } from "./errors.js";

type IsoOf<Value> = Value extends undefined ? undefined : string;

/**
 * Normalizes a timestamp argument for the wire: a `Date` becomes its ISO 8601
 * string, a string is passed through, and `undefined` stays absent so an
 * optional field is simply omitted.
 * @param value The `Date` or ISO 8601 string given by the caller.
 * @param field The field's name, for the error message.
 * @returns The ISO 8601 string to send, or `undefined` when none was given.
 * @throws LayloConfigurationError When the `Date` is invalid.
 */
export const isoTimestamp = <Value extends string | Date | undefined>(
  value: Value,
  field: string,
): IsoOf<Value> => {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new LayloConfigurationError(
        `${field} is an invalid Date; pass a valid Date or an ISO 8601 string`,
      );
    }
    return value.toISOString() as IsoOf<Value>;
  }
  return value as IsoOf<Value>;
};
