import type { RequestOptions } from "../core/request-options.js";
import type { VerifyKeyResponse } from "../types.js";
import { APIResource } from "./base.js";

/**
 * Customer API key checks, exposed as `laylo.keys`.
 * @see https://developers.laylo.com/api-reference/users/keys.verify
 */
export class Keys extends APIResource {
  /**
   * Verifies that a customer API key is valid for your integrator account —
   * the way to validate a key a customer gives you before storing it. An
   * invalid key throws `AuthenticationError` with `apiKeyStatus: "invalid"`;
   * a valid key whose account has no paid Laylo plan throws `PermissionError`.
   * @param options Per-call overrides; pass `apiKey` here to check a key other
   * than the client's.
   * @returns Confirmation that the key is valid.
   * @example
   * ```ts
   * try {
   *   await laylo.keys.verify({ apiKey: untrustedKey });
   * } catch (error) {
   *   if (error instanceof AuthenticationError && error.apiKeyStatus === "invalid") {
   *     // reject the key instead of storing it
   *   }
   *   throw error;
   * }
   * ```
   * @see https://developers.laylo.com/api-reference/users/keys.verify
   */
  verify(options?: RequestOptions): Promise<VerifyKeyResponse> {
    return this.request<VerifyKeyResponse>(
      { method: "GET", path: "/v1/keys/verify" },
      options,
    );
  }
}
