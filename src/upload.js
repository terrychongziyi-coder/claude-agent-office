// Files dropped or pasted into chat are saved here; workers get read access with --add-dir.
// ponytail: never cleaned up; delete uploads/ by hand, or add an age-based sweep if it grows.
import { mkdirSync } from 'fs';
import { join, basename } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';

export const UPLOADS = fileURLToPath(new URL('../uploads', import.meta.url));
export const MAX_UPLOAD = 25 * 1024 * 1024;
mkdirSync(UPLOADS, { recursive: true });

// Keeps letters, digits, dot, dash and underscore, so the saved path has no spaces and is linkable.
export function safeName(raw) {
  const name = basename(String(raw ?? '')).normalize('NFC').replace(/[^\p{L}\p{N}._-]+/gu, '_').replace(/^[._]+/, '').slice(-120);
  return name || 'file';
}

// A fresh folder per upload, so two files with the same name never overwrite each other.
export function uploadPath(raw, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  return join(UPLOADS, `${stamp}-${randomBytes(3).toString('hex')}`, safeName(raw));
}
