import type { TokenProvider } from "../core/auth.js";
import type { RequestOptions } from "../core/request-options.js";
import type { TokenResponse } from "../types.js";

/**
 * Access-token operations, exposed as `laylo.auth`. The SDK mints and
 * refreshes tokens on its own; use this only to obtain a raw token for
 * calling the API directly.
 * @see https://developers.laylo.com/authentication
 */
export class Auth {
  private readonly tokens: TokenProvider;

  /**
   * @param tokens The provider that mints and caches access tokens.
   */
  constructor(tokens: TokenProvider) {
    this.tokens = tokens;
  }

  /**
   * Mints a fresh access token.
   * @param options Per-call overrides; only `signal` applies here.
   * @returns The token, its type, and its lifetime in seconds.
   * @example
   * ```ts
   * const { access_token, expires_in } = await laylo.auth.createToken();
   * ```
   * @see https://developers.laylo.com/api-reference/auth/auth.token.create
   */
  createToken(
    options?: Pick<RequestOptions, "signal">,
  ): Promise<TokenResponse> {
    return this.tokens.createToken(options?.signal);
  }
}
