import { readFile, writeFile } from 'fs/promises';
import { randomBytes } from 'crypto';
import { fileURLToPath } from 'url';

const CONFIG_PATH = process.env.CONFIG_PATH ?? fileURLToPath(new URL('../config.json', import.meta.url));

let _cfg = null;

export async function loadConfig() {
  if (_cfg) return _cfg;
  try {
    _cfg = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
  } catch {
    _cfg = {};
  }
  if (!_cfg.token) {
    _cfg.token = randomBytes(24).toString('hex');
    await saveConfig(_cfg);
  }
  return _cfg;
}

export async function saveConfig(data) {
  _cfg = { ..._cfg, ...data };
  await writeFile(CONFIG_PATH, JSON.stringify(_cfg, null, 2), 'utf8');
}
