import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { Request, Response, NextFunction } from 'express';
import { errorHandler } from '../src/error-handler.js';
import { AppError, BadRequest, NotFound } from '../src/errors.js';
import { createTestContext } from './helpers.js';

/** Minimal fake Response capturing status + body. */
function fakeRes(): Response & { statusCode?: number; body?: unknown } {
  const res = {
    statusCode: undefined as number | undefined,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res as unknown as Response & { statusCode?: number; body?: unknown };
}

const req = {} as Request;
const next = (() => {}) as NextFunction;

test('error handler: AppError keeps its status and message', () => {
  const res = fakeRes();
  errorHandler(new NotFound('Chat not found'), req, res, next);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Chat not found' });
});

test('error handler: BadRequest → 400', () => {
  const res = fakeRes();
  errorHandler(new BadRequest('msgId is required'), req, res, next);
  assert.equal(res.statusCode, 400);
});

test('error handler: URIError (scanner path probing) → 400, no stack leak', () => {
  const res = fakeRes();
  errorHandler(new URIError('Failed to decode param'), req, res, next);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'Bad request' });
});

test('error handler: error carrying a 4xx status → 400 (not a server fault)', () => {
  const res = fakeRes();
  const err = new SyntaxError('Unexpected token in JSON') as SyntaxError & { status: number };
  err.status = 400; // body-parser does this for malformed JSON
  errorHandler(err, req, res, next);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'Bad request' });
});

test('error handler: genuine internal error → 500 with generic message', () => {
  const res = fakeRes();
  const originalError = console.error;
  console.error = () => {}; // silence the intentional log
  try {
    errorHandler(new Error('boom'), req, res, next);
  } finally {
    console.error = originalError;
  }
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Internal server error' });
});

test('error handler: AppError subclass keeps its own status (base class)', () => {
  const res = fakeRes();
  errorHandler(new AppError(403, 'Nope'), req, res, next);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: 'Nope' });
});

// ── integration: the real app must answer malformed input with 400 ──────

test('malformed JSON body → 400 (not 500)', async () => {
  const ctx = await createTestContext();
  try {
    const res = await fetch(`http://127.0.0.1:${ctx.port}/api/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not valid json',
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.ok(body.error, 'has an error message');
    assert.ok(!body.error.includes(' at '), 'no stack trace leaked');
  } finally {
    await ctx.close();
  }
});

test('malformed percent-encoded path → 400 (scanner probe), not 500', async () => {
  const ctx = await createTestContext();
  try {
    const status = await new Promise<number>((resolve, reject) => {
      // raw http so the malformed path survives verbatim (fetch would normalise it)
      const r = http.request(
        { host: '127.0.0.1', port: ctx.port, method: 'GET', path: '/api/chats/%%32%65%%32%65' },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );
      r.on('error', reject);
      r.end();
    });
    assert.equal(status, 400);
  } finally {
    await ctx.close();
  }
});
