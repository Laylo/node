import { LayloConfigurationError } from "./errors.js";

/**
 * Checks that an array argument holds between one and `max` entries. The API
 * refuses these too; checking here saves a round trip that would only come
 * back as a 400.
 * @param field The argument's name, for the error message.
 * @param values The entries the caller passed.
 * @param max The most entries the endpoint accepts.
 * @param noun What one entry is, like `"phone number"`, for the error message.
 * @throws LayloConfigurationError When `values` is empty or longer than `max`.
 */
export const assertBatchSize = (
  field: string,
  values: readonly unknown[],
  max: number,
  noun: string,
): void => {
  if (values.length === 0) {
    throw new LayloConfigurationError(
      `${field} must contain at least one ${noun}`,
    );
  }
  if (values.length > max) {
    throw new LayloConfigurationError(
      `${field} must contain at most ${String(max)} ${noun}s, received ${String(values.length)}`,
    );
  }
};
