import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Db } from '../db.js';
import { config } from '../config.js';
import { BadRequest } from '../errors.js';

export interface FileDTO {
  id: number;
  name: string;
  mime: string;
  size: number;
  url: string;
}

export interface StoredFile {
  id: number;
  owner_id: number;
  name: string;
  mime: string;
  size: number;
  sha256: string;
  stored_path: string;
}

/**
 * Persist an uploaded file to disk (content-addressed by sha256) and record it.
 * Duplicate content is deduplicated to a single row + blob.
 */
export function storeUpload(
  db: Db,
  ownerId: number,
  file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
): FileDTO {
  if (file.size === 0) throw new BadRequest('Empty files are not allowed');
  if (file.size > config.maxUploadBytes) {
    throw new BadRequest(`File too large (max ${Math.floor(config.maxUploadBytes / 1024 / 1024)} MB)`);
  }

  const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');

  const existing = db.prepare('SELECT id, name, mime, size FROM files WHERE sha256 = ?').get(sha256) as
    | { id: number; name: string; mime: string; size: number }
    | undefined;
  if (existing) {
    return { id: existing.id, name: existing.name, mime: existing.mime, size: existing.size, url: `/api/files/${existing.id}` };
  }

  const subdir = sha256.slice(0, 2);
  const dir = path.join(config.uploadsDir, subdir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(config.uploadsDir, subdir, sha256), file.buffer);

  const info = db
    .prepare('INSERT INTO files (owner_id, name, mime, size, sha256, stored_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(ownerId, file.originalname, file.mimetype, file.size, sha256, path.join(subdir, sha256), Date.now());

  return {
    id: Number(info.lastInsertRowid),
    name: file.originalname,
    mime: file.mimetype,
    size: file.size,
    url: `/api/files/${info.lastInsertRowid}`,
  };
}

export function getFileRow(db: Db, id: number): StoredFile | undefined {
  return db.prepare('SELECT id, owner_id, name, mime, size, sha256, stored_path FROM files WHERE id = ?').get(id) as
    | StoredFile
    | undefined;
}
