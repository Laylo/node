import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import Laylo, {
  AuthenticationError,
  BadRequestError,
  ConflictError,
  Laylo as NamedLaylo,
  LayloAPIError,
  LayloConfigurationError,
  LayloConnectionError,
  LayloError,
  LayloTimeoutError,
  MethodNotAllowedError,
  NotFoundError,
  NotImplementedError,
  PermissionError,
  RateLimitError,
  ServerError,
  VERSION,
} from "../index.js";

describe("VERSION", () => {
  it("matches package.json", () => {
    const { version } = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    ) as { version: string };

    expect(VERSION).toBe(version);
  });
});

describe("exports", () => {
  it("makes Laylo both the default and a named export", () => {
    expect(Laylo).toBe(NamedLaylo);
  });

  it("exposes every error class", () => {
    expect([
      LayloError,
      LayloAPIError,
      BadRequestError,
      AuthenticationError,
      PermissionError,
      NotFoundError,
      MethodNotAllowedError,
      ConflictError,
      RateLimitError,
      NotImplementedError,
      ServerError,
      LayloConnectionError,
      LayloTimeoutError,
      LayloConfigurationError,
    ]).not.toContain(undefined);
  });
});
