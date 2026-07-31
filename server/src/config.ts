import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  uploadsDir: string;
  dbPath: string;
  certPath: string;
  keyPath: string;
  jwtSecret: string;
  maxUploadBytes: number;
  maxWsFrameBytes: number;
}

// Assumes the server is launched from the server/ directory (npm -w server does this).
// Override with SERVER_ROOT when launching from elsewhere.
const serverRoot = path.resolve(process.env.SERVER_ROOT ?? process.cwd());

function loadOrCreateJwtSecret(dataDir: string): string {
  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv) return fromEnv;
  const file = path.join(dataDir, '.jwt-secret');
  fs.mkdirSync(dataDir, { recursive: true });
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

export const config: Config = (() => {
  const dataDir = path.resolve(process.env.DATA_DIR ?? path.join(serverRoot, '..', 'data'));
  const uploadsDir = path.join(dataDir, 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });

  return {
    port: Number(process.env.PORT ?? 8443),
    host: process.env.HOST ?? '0.0.0.0',
    dataDir,
    uploadsDir,
    dbPath: process.env.DB_PATH ?? path.join(dataDir, 'chatpulse.db'),
    certPath: path.resolve(process.env.CERT_PATH ?? path.join(serverRoot, '..', 'certs', 'cert.pem')),
    keyPath: path.resolve(process.env.KEY_PATH ?? path.join(serverRoot, '..', 'certs', 'key.pem')),
    jwtSecret: loadOrCreateJwtSecret(dataDir),
    maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES ?? 25 * 1024 * 1024),
    maxWsFrameBytes: 64 * 1024,
  };
})();
