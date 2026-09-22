import type { TokenResponse } from "../types.js";
import { LayloConfigurationError } from "./errors.js";
import type { HttpClient } from "./http.js";

/** Settings for the token provider. */
export interface TokenProviderOptions {
  /** Laylo user id of the account your integrator credentials belong to. */
  userId: string;
  /** Integrator access key. */
  accessKey: string;
  /** Integrator secret key. */
  secretKey: string;
  /** Transport used to call the token endpoint. */
  http: HttpClient;
  /** Returns the current time in milliseconds; defaults to `Date.now`. */
  clock?: () => number;
  /** How long before expiry to refresh, in milliseconds. */
  refreshSkewMs?: number;
}

const DEFAULT_REFRESH_SKEW_MS = 60_000;

const AUTH_DOCS = "https://developers.laylo.com/authentication";

const present = (
  value: string | undefined,
  option: "userId" | "accessKey" | "secretKey",
): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new LayloConfigurationError(
      `${option} is missing — copy it from your integrator credentials. See ${AUTH_DOCS}`,
    );
  }
  return value;
};

// A mint is shared by every caller waiting on it, so an abort must eject only
// that caller: the request itself keeps going and still caches its token.
const rejectOnAbort = <T>(
  shared: Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T> => {
  if (signal === undefined) {
    return shared;
  }

  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason as Error);
    signal.addEventListener("abort", onAbort, { once: true });
    shared.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: Error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
};

interface CachedToken {
  accessToken: string;
  refreshAt: number;
}

/**
 * Mints access tokens from `POST /v1/auth/token` and caches them for their
 * lifetime, so integrators only ever supply `userId`, `accessKey`, and
 * `secretKey`.
 * @see https://developers.laylo.com/authentication
 */
export class TokenProvider {
  private readonly userId: string;
  private readonly accessKey: string;
  private readonly secretKey: string;
  private readonly http: HttpClient;
  private readonly clock: () => number;
  private readonly refreshSkewMs: number;
  private cached: CachedToken | undefined;
  private inFlightMint: Promise<TokenResponse> | undefined;

  /**
   * @param options Credentials, transport, and cache tuning.
   */
  constructor(options: TokenProviderOptions) {
    const userId = present(options.userId, "userId");
    // The API splits client_id on its first "." to recover the two halves,
    // which a Laylo user id never contains.
    if (userId.includes(".")) {
      throw new LayloConfigurationError(
        `userId must not contain a "." — pass the access key separately as accessKey. See ${AUTH_DOCS}`,
      );
    }

    this.userId = userId;
    this.accessKey = present(options.accessKey, "accessKey");
    this.secretKey = present(options.secretKey, "secretKey");
    this.http = options.http;
    this.clock = options.clock ?? Date.now;
    this.refreshSkewMs = options.refreshSkewMs ?? DEFAULT_REFRESH_SKEW_MS;
  }

  /**
   * Returns a valid access token, minting one only when the cached token is
   * missing or about to expire. Concurrent callers share a single mint.
   * @param signal Stops this caller's wait when signalled; a mint shared with
   * other callers carries on without them.
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

  /**
   * Drops the cached token so the next call mints a fresh one.
   * @param staleToken When given, only drops the cache while it still holds
   * this token, so a concurrent caller's fresh token survives.
   */
  invalidate(staleToken?: string): void {
    if (staleToken !== undefined && this.cached?.accessToken !== staleToken) {
      return;
    }

    this.cached = undefined;
  }

  /**
   * Mints a fresh token and returns the full response, for integrators who
   * want to call the API directly instead of through the SDK.
   * @param signal Stops this caller's wait when signalled; a mint shared with
   * other callers carries on without them.
   * @returns The token endpoint's response.
   * @see https://developers.laylo.com/api-reference/auth/auth.token.create
   */
  createToken(signal?: AbortSignal): Promise<TokenResponse> {
    return this.mint(signal);
  }

  private mint(signal?: AbortSignal): Promise<TokenResponse> {
    if (signal?.aborted) {
      return Promise.reject(signal.reason as Error);
    }
    if (this.inFlightMint === undefined) {
      this.inFlightMint = this.requestToken().finally(() => {
        this.inFlightMint = undefined;
      });
    }

    return rejectOnAbort(this.inFlightMint, signal);
  }

  private async requestToken(): Promise<TokenResponse> {
    const mintedAt = this.clock();
    const { data } = await this.http.request<TokenResponse>({
      method: "POST",
      path: "/v1/auth/token",
      body: {
        client_id: `${this.userId}.${this.accessKey}`,
        client_secret: this.secretKey,
      },
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
   * @returns Only the user id and access key — `private` fields are
   * enumerable at runtime, so without this a structured logger serializing the
   * provider would emit the secret key and the cached token.
   */
  toJSON(): { userId: string; accessKey: string } {
    return { userId: this.userId, accessKey: this.accessKey };
  }

  /**
   * @returns A description with the secret and token redacted, so the
   * provider is safe to `console.log` or `util.inspect`.
   */
  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return `TokenProvider { userId: ${JSON.stringify(this.userId)}, accessKey: ${JSON.stringify(this.accessKey)}, secretKey: [redacted] }`;
  }
}
