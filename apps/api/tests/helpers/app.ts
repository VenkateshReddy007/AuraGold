/**
 * tests/helpers/app.ts
 *
 * Shared test utilities: supertest agent + unique mobile generator.
 *
 * NOTE: Do NOT call afterAll here — Vitest 2.x does not allow lifecycle
 * hooks in helper modules imported by test files. Register server
 * teardown in each test file's own afterAll.
 */

import { createServer, type Server } from "node:http";
import supertest from "supertest";
import { createApp } from "../../src/app.js";

let _server: Server | null = null;
let _agent: ReturnType<typeof supertest.agent> | null = null;

function initServer() {
  if (_server && _agent) return { server: _server, agent: _agent };
  const app = createApp();
  _server = createServer(app);
  _agent = supertest.agent(_server);
  return { server: _server, agent: _agent };
}

/** Get (or lazily create) a supertest agent. */
export function getAgent(): ReturnType<typeof supertest.agent> {
  return initServer().agent;
}

/** Close the underlying HTTP server — call this in afterAll of each test file. */
export function closeServer(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (_server?.listening) {
      _server.close(() => resolve());
    } else {
      resolve();
    }
  });
}

/**
 * Generate a unique valid Indian mobile number per test.
 * 9 + 9-digit zero-padded counter = 10 digits, starts with 9.
 */
let _seq = 100;
export function uniqueMobile(): string {
  return `9${String(_seq++).padStart(9, "0")}`;
}

/**
 * The API masks mobileNumber: first-4 + "XXXX" + last-2
 * e.g. "9000000101" → "9000XXXX01"
 */
export function maskMobile(mobile: string): string {
  return `${mobile.slice(0, 4)}XXXX${mobile.slice(8)}`;
}
