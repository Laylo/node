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

/**
 * Segment filters with their sign-up bounds also accepting a `Date`, which is
 * sent as its ISO 8601 string.
 */
export type WithDateSignUpBounds<Filters> = Omit<
  Filters,
  "signedUpAfter" | "signedUpBefore"
> & {
  /**
   * Only fans who signed up at or after this time: a `Date`, or an ISO 8601
   * string with an explicit UTC offset.
   */
  signedUpAfter?: string | Date;
  /**
   * Only fans who signed up before this time (exclusive): a `Date`, or an ISO
   * 8601 string with an explicit UTC offset.
   */
  signedUpBefore?: string | Date;
};

/**
 * Normalizes a segment's sign-up bounds for the wire with {@link isoTimestamp}.
 * @param filters The filters carrying the bounds.
 * @param prefix Prepended to each field's name in error messages.
 * @returns Both bounds as ISO 8601 strings, or `undefined` when not given.
 * @throws LayloConfigurationError When a `Date` is invalid.
 */
export const isoSignUpBounds = (
  filters: WithDateSignUpBounds<object>,
  prefix = "",
) => ({
  signedUpAfter: isoTimestamp(filters.signedUpAfter, `${prefix}signedUpAfter`),
  signedUpBefore: isoTimestamp(
    filters.signedUpBefore,
    `${prefix}signedUpBefore`,
  ),
});
