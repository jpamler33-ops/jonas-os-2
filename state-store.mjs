import path from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';

const SCHEMA_VERSION = 1;
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
      const symbol = String(item?.symbol || '').toUpperCase();
      const target = Number(item?.target);
      const direction = item?.direction;
      const createdAt = Number(item?.createdAt);
      if (!SYMBOL_RE.test(symbol)) continue;
      if (!Number.isFinite(target) || target <= 0) continue;
      if (direction !== 'ABOVE' && direction !== 'BELOW') continue;
      if (!Number.isFinite(createdAt) || createdAt <= 0) continue;
      clean.push({ symbol, target, direction, createdAt });
      if (clean.length >= 20) break;
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
    const clean = list.slice(0,20).map(item => ({
      symbol:String(item.symbol || '').toUpperCase(),
      target:Number(item.target),
      direction:item.direction,
      createdAt:Number(item.createdAt)
    })).filter(item =>
      SYMBOL_RE.test(item.symbol) &&
      Number.isFinite(item.target) && item.target > 0 &&
      (item.direction === 'ABOVE' || item.direction === 'BELOW') &&
      Number.isFinite(item.createdAt) && item.createdAt > 0
    );
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
    if (!parsed || parsed.schemaVersion !== SCHEMA_VERSION) {
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
