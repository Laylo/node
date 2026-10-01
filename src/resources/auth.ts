import type { TokenProvider } from "../core/auth.js";
import { LayloConfigurationError } from "../core/errors.js";
import type { RequestOptions } from "../core/request-options.js";
import type { TokenResponse } from "../types.js";

/**
 * Access-token operations, exposed as `laylo.auth`. The SDK mints and
 * refreshes tokens on its own; use this only to obtain a raw token for
 * calling the API directly. A client constructed with only an API key has no
 * integrator credentials to mint with, so `createToken` rejects there.
 * @see https://developers.laylo.com/authentication
 */
export class Auth {
  private readonly tokens: TokenProvider | undefined;

  /**
   * @param tokens The provider that mints and caches access tokens, or
   * `undefined` on a client constructed with only an API key.
   */
  constructor(tokens: TokenProvider | undefined) {
    this.tokens = tokens;
  }

  /**
   * Mints a fresh access token.
   * @param options Per-call overrides; only `signal` applies here.
   * @returns The token, its type, and its lifetime in seconds. Rejects with a
   * `LayloConfigurationError` on a client constructed with only an API key.
   * @example
   * ```ts
   * const { access_token, expires_in } = await laylo.auth.createToken();
   * ```
   * @see https://developers.laylo.com/api-reference/auth/auth.token.create
   */
  createToken(
    options?: Pick<RequestOptions, "signal">,
  ): Promise<TokenResponse> {
    if (this.tokens === undefined) {
      return Promise.reject(
        new LayloConfigurationError(
          "createToken needs integrator credentials — a client constructed with only an apiKey sends the key on its own and has no access token to mint. See https://developers.laylo.com/authentication",
        ),
      );
    }
    return this.tokens.createToken(options?.signal);
  }
}
