import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { AppError } from './errors.js';

/**
 * Central Express error handler — shared by the real server (index.ts) and the
 * test harness so they can never drift.
 *
 * Classification:
 *  - AppError (our own, deliberate)      → its status code + message
 *  - multer errors (bad uploads)         → 400 with multer's message
 *  - client-side request faults          → 400 "Bad request", NOT logged:
 *      • URIError from malformed percent-encoding (internet scanners probing
 *        paths like /cgi-bin/%%32%65%%32%65/bin/sh, and bad route params)
 *      • any error carrying a 4xx status (body-parser "malformed JSON",
 *        static-file rejections — 400/403/404 from send/serve-static)
 *  - anything else                       → 500, logged (a real server fault)
 */
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  if (err instanceof multer.MulterError) {
    res.status(400).json({ error: err.message });
    return;
  }

  const e = err as { status?: unknown; statusCode?: unknown };
  const raw = typeof e.status === 'number' ? e.status : e.statusCode;
  const status = typeof raw === 'number' ? raw : undefined;

  if (err instanceof URIError || (status !== undefined && status >= 400 && status < 500)) {
    // Malformed client input — a 4xx, not a server fault. Don't log the noise.
    res.status(400).json({ error: 'Bad request' });
    return;
  }

  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
}
