import path from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { sanitizeAlert } from './alert-engine.mjs';

export const STATE_STORE_SCHEMA_VERSION = 2;
export const STATE_STORE_LEGACY_SCHEMA_VERSIONS = Object.freeze([1]);
const SCHEMA_VERSION = STATE_STORE_SCHEMA_VERSION;
const LEGACY_SCHEMA_VERSION = STATE_STORE_LEGACY_SCHEMA_VERSIONS[0];
const SYMBOL_RE = /^[A-Z0-9]{2,18}USDT$/;

function validChatKey(key) {
  return /^-?\d{1,32}$/.test(String(key));
}

function sanitizeFavorites(raw) {
  const out = new Map();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [chatKey, values] of Object.entries(raw)) {
    if (!validChatKey(chatKey) || !Array.isArray(values)) continue;
    const clean = [...new Set(values
      .map(x => String(x).toUpperCase())
      .filter(x => SYMBOL_RE.test(x)))]
      .slice(0,100);
    if (clean.length) out.set(chatKey,new Set(clean));
  }
  return out;
}

function sanitizeAlerts(raw) {
  const out = new Map();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [chatKey, values] of Object.entries(raw)) {
    if (!validChatKey(chatKey) || !Array.isArray(values)) continue;
    const clean = [];
    for (const item of values) {
      const alert=sanitizeAlert(item);
      if(!alert) continue;
      clean.push(alert);
      if (clean.length >= 50) break;
    }
    if (clean.length) out.set(chatKey,clean);
  }
  return out;
}

function serializeMapSets(map) {
  const out = {};
  for (const [chatKey,set] of map) {
    if (!validChatKey(chatKey)) continue;
    const clean = [...set].map(x => String(x).toUpperCase()).filter(x => SYMBOL_RE.test(x)).slice(0,100);
    if (clean.length) out[chatKey] = clean;
  }
  return out;
}

function serializeAlerts(map) {
  const out = {};
  for (const [chatKey,list] of map) {
    if (!validChatKey(chatKey) || !Array.isArray(list)) continue;
    const clean=[];
    for(const item of list.slice(0,50)){
      const alert=sanitizeAlert(item);
      if(alert) clean.push(alert);
    }
    if (clean.length) out[chatKey] = clean;
  }
  return out;
}

async function backupCorrupt(filePath) {
  const backupPath = `${filePath}.corrupt-${Date.now()}`;
  try {
    await rename(filePath,backupPath);
    return backupPath;
  } catch {
    return null;
  }
}

export async function loadPersistentState(filePath) {
  await mkdir(path.dirname(filePath),{ recursive:true });
  try {
    const raw = await readFile(filePath,'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || ![LEGACY_SCHEMA_VERSION,SCHEMA_VERSION].includes(Number(parsed.schemaVersion))) {
      throw new Error(`unsupported state schema: ${parsed?.schemaVersion}`);
    }
    return {
      favorites:sanitizeFavorites(parsed.favorites),
      alerts:sanitizeAlerts(parsed.alerts),
      recoveredFromCorrupt:false,
      backupPath:null
    };
  } catch (err) {
    if (err?.code === 'ENOENT') {
      return { favorites:new Map(), alerts:new Map(), recoveredFromCorrupt:false, backupPath:null };
    }
    const backupPath = await backupCorrupt(filePath);
    console.error('state load failed; starting clean',err instanceof Error ? err.message : String(err),backupPath || '');
    return { favorites:new Map(), alerts:new Map(), recoveredFromCorrupt:true, backupPath };
  }
}

export async function savePersistentState(filePath,{ favorites, alerts }) {
  await mkdir(path.dirname(filePath),{ recursive:true });
  const payload = {
    schemaVersion:SCHEMA_VERSION,
    updatedAt:new Date().toISOString(),
    favorites:serializeMapSets(favorites),
    alerts:serializeAlerts(alerts)
  };
  const tempPath = `${filePath}.tmp-${process.pid}`;
  await writeFile(tempPath,JSON.stringify(payload,null,2),{ encoding:'utf8', mode:0o600 });
  await rename(tempPath,filePath);
  return payload;
}
