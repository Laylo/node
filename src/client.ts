import { TokenProvider } from "./core/auth.js";
import { customerFrom, type Customer } from "./core/customer.js";
import { LayloConfigurationError } from "./core/errors.js";
import { HttpClient } from "./core/http.js";
import { DEFAULT_MAX_RETRIES } from "./core/retry.js";
import { Auth } from "./resources/auth.js";
import type { ResourceContext } from "./resources/base.js";
import { Conversions } from "./resources/conversions.js";
import { Drops } from "./resources/drops.js";
import { Fans } from "./resources/fans.js";
import { Keys } from "./resources/keys.js";
import { Messages } from "./resources/messages.js";
import { VERSION } from "./version.js";

/** Base URL used when `baseUrl` is not given. */
export const DEFAULT_BASE_URL = "https://events.laylo.com/api";

/** Per-request timeout in milliseconds used when `timeoutMs` is not given. */
export const DEFAULT_TIMEOUT_MS = 30_000;

export { DEFAULT_MAX_RETRIES } from "./core/retry.js";

const AUTH_DOCS = "https://developers.laylo.com/authentication";

/** Settings for the Laylo client. */
export interface ClientOptions {
  /**
   * Integrator client id in the form `<userId>.<accessKey>`; defaults to
   * `process.env.LAYLO_CLIENT_ID`.
   */
  clientId?: string | undefined;
  /**
   * Integrator client secret; defaults to `process.env.LAYLO_CLIENT_SECRET`.
   */
  clientSecret?: string | undefined;
  /**
   * Customer API key used by calls that do not name their own customer;
   * defaults to `process.env.LAYLO_API_KEY`. Leave it and `creatorId` unset
   * when one process serves several customers and scope each with
   * `forCustomer`.
   */
  apiKey?: string | undefined;
  /**
   * Laylo user id of an account on your roster, used in place of an API key by
   * calls that do not name their own customer; defaults to
   * `process.env.LAYLO_CREATOR_ID`. Only accounts that sit under your
   * integration's own Laylo account can be named this way. Set either this or
   * `apiKey`, not both.
   */
  creatorId?: string | undefined;
  /**
   * Identifies your integration in the `X-Laylo-Source` header; no default.
   */
  source?: string | undefined;
  /** Origin and path prefix for every request; defaults to `DEFAULT_BASE_URL`. */
  baseUrl?: string | undefined;
  /**
   * Per-request timeout in milliseconds, a positive integer; defaults to
   * `DEFAULT_TIMEOUT_MS`.
   */
  timeoutMs?: number | undefined;
  /**
   * Retries after the first attempt, a non-negative integer where `0` disables
   * retrying; defaults to `DEFAULT_MAX_RETRIES`.
   */
  maxRetries?: number | undefined;
  /**
   * `fetch` implementation to call the API with; defaults to the global one.
   * Supply your own to route requests through a proxy or a custom agent.
   */
  fetch?: typeof globalThis.fetch | undefined;
}

// Unexported so forCustomer views can share the parent's transport and token
// cache without widening the public `ClientOptions`.
const SHARED = Symbol("laylo.node.shared");

interface SharedCore {
  http: HttpClient;
  tokens: TokenProvider;
  clientId: string;
  baseUrl: string;
}

type ClientInit = ClientOptions & { [SHARED]?: SharedCore };

const missingCredential = (option: "clientId" | "clientSecret", env: string) =>
  new LayloConfigurationError(
    `${option} is missing — pass it when constructing the client or set ${env}. See ${AUTH_DOCS}`,
  );

const required = (
  value: string | undefined,
  option: "clientId" | "clientSecret",
  env: string,
): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw missingCredential(option, env);
  }
  return value;
};

const validBaseUrl = (baseUrl: string): string => {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new LayloConfigurationError(
      `baseUrl must be an absolute http(s) URL, received ${JSON.stringify(baseUrl)}`,
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new LayloConfigurationError(
      `baseUrl must use http or https, received ${JSON.stringify(baseUrl)}`,
    );
  }
  if (parsed.search !== "" || parsed.hash !== "") {
    throw new LayloConfigurationError(
      `baseUrl must not carry a query string or fragment, received ${JSON.stringify(baseUrl)}`,
    );
  }
  return baseUrl;
};

const wholeNumber = (
  value: number,
  option: "timeoutMs" | "maxRetries",
  min: 0 | 1,
): number => {
  if (!Number.isInteger(value) || value < min) {
    throw new LayloConfigurationError(
      `${option} must be ${min === 1 ? "a positive" : "a non-negative"} integer, received ${String(value)}`,
    );
  }
  return value;
};

// An empty LAYLO_API_KEY= line in a .env means "not set", not "the empty key".
const envOrUnset = (name: string): string | undefined => {
  const value = process.env[name];
  return value === undefined || value === "" ? undefined : value;
};

// Naming either half of the customer in code turns the environment off for
// both, so an explicit creatorId is not refused for clashing with a
// LAYLO_API_KEY that happens to be set.
const customerFromOptionsOrEnv = (
  options: ClientOptions,
): Customer | undefined => {
  if (options.apiKey !== undefined || options.creatorId !== undefined) {
    return customerFrom(options);
  }
  const apiKey = envOrUnset("LAYLO_API_KEY");
  const creatorId = envOrUnset("LAYLO_CREATOR_ID");
  if (apiKey !== undefined && creatorId !== undefined) {
    throw new LayloConfigurationError(
      "Set either LAYLO_API_KEY or LAYLO_CREATOR_ID to name the customer, not both",
    );
  }
  return customerFrom({ apiKey, creatorId });
};

// Enough of the key to tell two apart in a log without disclosing either.
const mask = (apiKey: string | undefined) => {
  if (apiKey === undefined) {
    return undefined;
  }
  return apiKey.length < 8 ? "[redacted]" : `…${apiKey.slice(-4)}`;
};

/**
 * The Laylo API client. Construct it once with your integrator credentials and
 * reach every endpoint through its resources; access tokens are minted and
 * refreshed for you.
 * @example
 * ```ts
 * const laylo = new Laylo({
 *   clientId: process.env.LAYLO_CLIENT_ID,
 *   clientSecret: process.env.LAYLO_CLIENT_SECRET,
 * });
 *
 * const customer = laylo.forCustomer(customerApiKey);
 * await customer.keys.verify();
 *
 * // Or, for an account on your own roster, name it by id instead of a key:
 * const rosterAccount = laylo.forCustomer({ creatorId: customerUserId });
 * await rosterAccount.drops.list();
 * ```
 * @see https://developers.laylo.com
 */
export class Laylo {
  /** The resolved base URL every request is sent to. */
  readonly baseUrl: string;

  private readonly core: SharedCore;
  private readonly customer: Customer | undefined;
  private keysResource: Keys | undefined;
  private dropsResource: Drops | undefined;
  private conversionsResource: Conversions | undefined;
  private fansResource: Fans | undefined;
  private messagesResource: Messages | undefined;
  private authResource: Auth | undefined;

  /**
   * @param options Credentials and transport settings; each falls back to its
   * environment variable where it has one.
   */
  constructor(options: ClientOptions = {}) {
    const shared = (options as ClientInit)[SHARED];
    if (shared !== undefined) {
      this.core = shared;
      this.baseUrl = shared.baseUrl;
      this.customer = customerFrom(options);
      if (this.customer === undefined) {
        throw new LayloConfigurationError(
          "forCustomer needs an apiKey or a creatorId",
        );
      }
      return;
    }

    const clientId = required(
      options.clientId ?? process.env.LAYLO_CLIENT_ID,
      "clientId",
      "LAYLO_CLIENT_ID",
    );
    const clientSecret = required(
      options.clientSecret ?? process.env.LAYLO_CLIENT_SECRET,
      "clientSecret",
      "LAYLO_CLIENT_SECRET",
    );
    const customer = customerFromOptionsOrEnv(options);
    const baseUrl = validBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
    const timeoutMs = wholeNumber(
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      "timeoutMs",
      1,
    );
    const maxRetries = wholeNumber(
      options.maxRetries ?? DEFAULT_MAX_RETRIES,
      "maxRetries",
      0,
    );

    const http = new HttpClient({
      baseUrl,
      timeoutMs,
      maxRetries,
      userAgent: `laylo-node/${VERSION}`,
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      ...(options.source === undefined ? {} : { source: options.source }),
    });

    this.core = {
      http,
      tokens: new TokenProvider({ clientId, clientSecret, http }),
      clientId,
      baseUrl,
    };
    this.baseUrl = baseUrl;
    this.customer = customer;
  }

  /**
   * Scopes a client to one customer, for a process acting on behalf of several
   * Laylo accounts. Name the customer by the API key they gave you, or, when
   * their account sits under your integration's own Laylo account, by their
   * user id. The view shares this client's connections and access token, so
   * making one per request is cheap.
   * @param customer The customer's API key, or `{ apiKey }` or `{ creatorId }`.
   * @returns A client whose calls act as that customer unless a call names its
   * own.
   * @example
   * ```ts
   * const drops = await laylo.forCustomer(customerApiKey).drops.list();
   * const rosterDrops = await laylo
   *   .forCustomer({ creatorId: customerUserId })
   *   .drops.list();
   * ```
   */
  forCustomer(customer: string | Customer): Laylo {
    const fields =
      typeof customer === "string" ? { apiKey: customer } : customer;
    return new Laylo({ ...fields, [SHARED]: this.core } as ClientInit);
  }

  /**
   * @returns Customer API key checks: `laylo.keys.verify()`.
   */
  get keys(): Keys {
    return (this.keysResource ??= new Keys(this.context()));
  }

  /**
   * @returns Drop reads: `laylo.drops.list()`.
   */
  get drops(): Drops {
    return (this.dropsResource ??= new Drops(this.context()));
  }

  /**
   * @returns Conversion definitions, events, and tracking.
   */
  get conversions(): Conversions {
    return (this.conversionsResource ??= new Conversions(this.context()));
  }

  /**
   * @returns Fan lookups and segment counts.
   */
  get fans(): Fans {
    return (this.fansResource ??= new Fans(this.context()));
  }

  /**
   * @returns Messaging, starting with scheduled sends.
   */
  get messages(): Messages {
    return (this.messagesResource ??= new Messages(this.context()));
  }

  /**
   * @returns Access tokens, for calling the API outside the SDK.
   */
  get auth(): Auth {
    return (this.authResource ??= new Auth(this.core.tokens));
  }

  private context(): ResourceContext {
    return {
      http: this.core.http,
      tokens: this.core.tokens,
      customer: this.customer,
    };
  }

  /**
   * @returns The client id, base URL, creator id, and a masked API key —
   * `private` fields are enumerable at runtime, so without this a structured
   * logger serializing the client would emit the customer key and the
   * integrator secret. A creator id is an account identifier, not a
   * credential, so it is shown in full.
   */
  toJSON(): {
    clientId: string;
    baseUrl: string;
    apiKey: string | undefined;
    creatorId: string | undefined;
    clientSecret: string;
  } {
    return {
      clientId: this.core.clientId,
      baseUrl: this.baseUrl,
      apiKey: mask(this.customer?.apiKey),
      creatorId: this.customer?.creatorId,
      clientSecret: "[redacted]",
    };
  }

  /**
   * @returns A description with the secret redacted and the customer key
   * masked, so the client is safe to `console.log` or `util.inspect`.
   */
  [Symbol.for("nodejs.util.inspect.custom")](): string {
    const { apiKey, creatorId } = this.toJSON();
    const show = (value: string | undefined) =>
      value === undefined ? "undefined" : JSON.stringify(value);
    return `Laylo { clientId: ${JSON.stringify(this.core.clientId)}, baseUrl: ${JSON.stringify(this.baseUrl)}, apiKey: ${show(apiKey)}, creatorId: ${show(creatorId)}, clientSecret: [redacted] }`;
  }
}
