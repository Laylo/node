import { LayloConfigurationError } from "./errors.js";
import type { HttpClient } from "./http.js";

/**
 * Body returned by `POST /v1/auth/token`.
 * @see https://developers.laylo.com/api-reference/auth/auth.token.create
 */
export interface TokenResponse {
  /** Short-lived JWT to send as `Authorization: Bearer …`. */
  access_token: string;
  token_type: "Bearer";
  /** Seconds until the token expires. */
  expires_in: number;
}

/** Settings for the token provider. */
export interface TokenProviderOptions {
  /** Integrator client id in the form `<userId>.<accessKey>`. */
  clientId: string;
  /** Integrator client secret. */
  clientSecret: string;
  /** Transport used to call the token endpoint. */
  http: HttpClient;
  /** Returns the current time in milliseconds; defaults to `Date.now`. */
  clock?: () => number;
  /** How long before expiry to refresh, in milliseconds. */
  refreshSkewMs?: number;
}

const DEFAULT_REFRESH_SKEW_MS = 60_000;

interface CachedToken {
  accessToken: string;
  refreshAt: number;
}

/**
 * Mints access tokens from `POST /v1/auth/token` and caches them for their
 * lifetime, so integrators only ever supply `clientId` and `clientSecret`.
 * @see https://developers.laylo.com/authentication
 */
export class TokenProvider {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly http: HttpClient;
  private readonly clock: () => number;
  private readonly refreshSkewMs: number;
  private cached: CachedToken | undefined;
  private inFlightMint: Promise<TokenResponse> | undefined;

  /**
   * @param options Credentials, transport, and cache tuning.
   */
  constructor(options: TokenProviderOptions) {
    if (!options.clientId.includes(".")) {
      throw new LayloConfigurationError(
        'clientId must have the form "<userId>.<accessKey>" — copy it from your integrator credentials. See https://developers.laylo.com/authentication',
      );
    }

    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.http = options.http;
    this.clock = options.clock ?? Date.now;
    this.refreshSkewMs = options.refreshSkewMs ?? DEFAULT_REFRESH_SKEW_MS;
  }

  /**
   * Returns a valid access token, minting one only when the cached token is
   * missing or about to expire. Concurrent callers share a single mint.
   * @param signal Aborts the mint request when signalled.
   * @returns The access token to send as `Authorization: Bearer …`.
   */
  async getToken(signal?: AbortSignal): Promise<string> {
    const cached = this.cached;
    if (cached !== undefined && this.clock() < cached.refreshAt) {
      return cached.accessToken;
    }

    const { access_token } = await this.mint(signal);
    return access_token;
  }

  /** Drops the cached token so the next call mints a fresh one. */
  invalidate(): void {
    this.cached = undefined;
  }

  /**
   * Mints a fresh token and returns the full response, for integrators who
   * want to call the API directly instead of through the SDK.
   * @param signal Aborts the mint request when signalled.
   * @returns The token endpoint's response.
   * @see https://developers.laylo.com/api-reference/auth/auth.token.create
   */
  createToken(signal?: AbortSignal): Promise<TokenResponse> {
    return this.mint(signal);
  }

  private mint(signal?: AbortSignal): Promise<TokenResponse> {
    if (this.inFlightMint === undefined) {
      this.inFlightMint = this.requestToken(signal).finally(() => {
        this.inFlightMint = undefined;
      });
    }

    return this.inFlightMint;
  }

  private async requestToken(signal?: AbortSignal): Promise<TokenResponse> {
    const mintedAt = this.clock();
    const { data } = await this.http.request<TokenResponse>({
      method: "POST",
      path: "/v1/auth/token",
      body: { client_id: this.clientId, client_secret: this.clientSecret },
      ...(signal === undefined ? {} : { signal }),
    });

    // The skew is capped at half the lifetime so a short-lived token (the
    // API can go as low as 60s) still has a window in which it is served
    // from cache instead of being re-minted on every call.
    const ttlMs = data.expires_in * 1000;
    const skewMs = Math.min(this.refreshSkewMs, ttlMs / 2);
    this.cached = {
      accessToken: data.access_token,
      refreshAt: mintedAt + ttlMs - skewMs,
    };
    return data;
  }

  /**
   * @returns A description with the secret and token redacted, so the
   * provider is safe to `console.log` or `util.inspect`.
   */
  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return `TokenProvider { clientId: ${JSON.stringify(this.clientId)}, clientSecret: [redacted] }`;
  }
}
