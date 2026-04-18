import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.config', 'rampart-cli');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

interface Config {
  apiKey: string;
  apiUrl: string;
}

function readConfig(): Config {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch {}
  return { apiKey: '', apiUrl: 'https://api.rampartscan.com' };
}

function writeConfig(config: Config): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}

export function getApiKey(): string {
  return process.env.RAMPART_API_KEY || readConfig().apiKey || '';
}

export function setApiKey(key: string): void {
  const config = readConfig();
  config.apiKey = key;
  writeConfig(config);
}

export function getApiUrl(): string {
  return process.env.RAMPART_API_URL || readConfig().apiUrl;
}
