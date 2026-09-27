import http from 'node:http';

const token = process.env.TCX_TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('Missing TCX_TELEGRAM_BOT_TOKEN');

const telegramApi = `https://api.telegram.org/bot${token}`;
const configuredBinanceBases = process.env.TCX_BINANCE_REST_BASES || process.env.TCX_BINANCE_REST_BASE || '';
const binanceBases = (configuredBinanceBases
  ? configuredBinanceBases.split(',')
  : ['https://data-api.binance.vision','https://api1.binance.com','https://api.binance.com'])
  .map(x => x.trim().replace(/\/+$/, '')).filter(Boolean);
const refreshMs = Math.max(5000, Number(process.env.TCX_TELEGRAM_REFRESH_MS || 10000));
const allowedChats = new Set((process.env.TCX_TELEGRAM_ALLOWED_CHATS || '').split(',').map(x => x.trim()).filter(Boolean));
const requestedSymbols = (process.env.TCX_TELEGRAM_SYMBOLS || 'BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,XRPUSDT,DOGEUSDT,ADAUSDT,LINKUSDT')
  .split(',').map(x => x.trim().toUpperCase()).filter(Boolean);

const MARKET_META = {
  BTCUSDT: ['₿','BTC'], ETHUSDT: ['Ξ','ETH'], SOLUSDT: ['◎','SOL'], BNBUSDT: ['🟡','BNB'],
  XRPUSDT: ['✕','XRP'], DOGEUSDT: ['Ð','DOGE'], ADAUSDT: ['₳','ADA'], LINKUSDT: ['⬡','LINK']
};
const markets = requestedSymbols.map(symbol => ({ symbol, icon: MARKET_META[symbol]?.[0] || '•', label: MARKET_META[symbol]?.[1] || symbol.replace('USDT','') }));
const bySymbol = new Map(markets.map(m => [m.symbol, m]));
const sessions = new Map();
let offset = 0;
let running = true;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const permitted = chatId => allowedChats.size === 0 || allowedChats.has(String(chatId));
const fmt = (n, max=2) => Number(n).toLocaleString('de-DE', { maximumFractionDigits:max });
const clamp = (x,a,b) => Math.max(a, Math.min(b, x));

async function fetchJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'user-agent': 'TCX-v2-SHADOW_ONLY',
        'accept': 'application/json'
      }
    });
    const body = await res.text();
    if (!res.ok) {
      const detail = body.slice(0, 180).replace(/\\s+/g, ' ');
      throw new Error(`HTTP ${res.status} ${new URL(url).host}: ${detail}`);
    }
    try { return JSON.parse(body); }
    catch { throw new Error(`Invalid JSON from ${new URL(url).host}`); }
  } finally { clearTimeout(timer); }
}

async function fetchMarketParts(symbol) {
  const encoded = encodeURIComponent(symbol);
  const errors = [];
  for (const base of binanceBases) {
    try {
      const [ticker, book, depth] = await Promise.all([
        fetchJson(`${base}/api/v3/ticker/24hr?symbol=${encoded}`),
        fetchJson(`${base}/api/v3/ticker/bookTicker?symbol=${encoded}`),
        fetchJson(`${base}/api/v3/depth?symbol=${encoded}&limit=20`)
      ]);
      return { ticker, book, depth, base };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${base}: ${msg}`);
      console.warn('market-data endpoint failed', base, msg);
    }
  }
  throw new Error(`All Binance market-data endpoints failed: ${errors.join(' | ')}`);
}

async function tg(method, body) {
  const res = await fetch(`${telegramApi}/${method}`, {
    method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({ ok:false, description:`HTTP ${res.status}` }));
  if (!res.ok || !data.ok) {
    const msg = String(data?.description || `Telegram HTTP ${res.status}`);
    if (method === 'editMessageText' && msg.includes('message is not modified')) return null;
    throw new Error(msg);
  }
  return data.result;
}

function startKeyboard() {
  const rows = [];
  for (let i=0;i<markets.length;i+=2) rows.push(markets.slice(i,i+2).map(m => ({ text:`${m.icon} ${m.label}`, callback_data:`market:${m.symbol}` })));
  return { inline_keyboard: rows };
}

function marketKeyboard(symbol, live) {
  return { inline_keyboard: [
    [{ text:'🔄 Aktualisieren', callback_data:`refresh:${symbol}` }, { text:live?'⏸ Live aus':'⚡ Live an', callback_data:`live:${symbol}:${live?'off':'on'}` }],
    [{ text:'🧠 TCX', callback_data:`tcx:${symbol}` }, { text:'⬅️ Zurück', callback_data:'back' }]
  ]};
}

function tcxKeyboard(symbol, live) {
  return { inline_keyboard: [
    [{ text:'📊 Markt', callback_data:`refresh:${symbol}` }],
    [{ text:live?'⏸ Live aus':'⚡ Live an', callback_data:`live:${symbol}:${live?'off':'on'}` }, { text:'⬅️ Zurück', callback_data:'back' }]
  ]};
}

async function snapshot(symbol) {
  const started = Date.now();
  const { ticker, book, depth, base } = await fetchMarketParts(symbol);
  const bids = (depth.bids || []).slice(0,10).map(([p,q]) => [Number(p),Number(q)]);
  const asks = (depth.asks || []).slice(0,10).map(([p,q]) => [Number(p),Number(q)]);
  const bid = Number(book.bidPrice), ask = Number(book.askPrice), mid = (bid + ask) / 2;
  const spread = ask - bid;
  const spreadBps = mid > 0 ? spread / mid * 10000 : 0;
  const bidNotional = bids.reduce((s,[p,q]) => s + p*q, 0);
  const askNotional = asks.reduce((s,[p,q]) => s + p*q, 0);
  const total = bidNotional + askNotional;
  const imbalance = total > 0 ? (bidNotional - askNotional) / total : 0;
  return {
    symbol, price:Number(ticker.lastPrice), changePct:Number(ticker.priceChangePercent),
    high:Number(ticker.highPrice), low:Number(ticker.lowPrice), volumeQuote:Number(ticker.quoteVolume),
    bid, ask, spreadBps, imbalance,
    timestamp: Date.now(), availableAt: Date.now(), source:'BINANCE_PUBLIC_REST', version:'v3',
    provenance:`ticker24hr+bookTicker+depth20; host=${new URL(base).host}; fetched_ms=${Date.now()-started}`
  };
}

function startText() {
  return [
    '🧠 TCX v2 · Live Market', '', 'Wähle eine Währung:', '',
    'Live-Daten: Binance · Execution: SHADOW_ONLY',
    'Keine Order-Ausführung.'
  ].join('\n');
}

function renderMarket(s, live) {
  const dir = s.changePct >= 0 ? '▲' : '▼';
  const im = s.imbalance > 0.12 ? 'Bid-lastig' : s.imbalance < -0.12 ? 'Ask-lastig' : 'ausgeglichen';
  return [
    `📊 ${s.symbol.replace('USDT','/USDT')} · Binance`, '',
    `💰 ${fmt(s.price, s.price < 1 ? 6 : 2)} USDT`,
    `${dir} 24h: ${s.changePct >= 0 ? '+' : ''}${fmt(s.changePct,2)} %`,
    `↕️ 24h: ${fmt(s.low,2)} – ${fmt(s.high,2)}`,
    `📦 Quote-Volumen: ${fmt(s.volumeQuote,0)} USDT`, '',
    `📖 Bid / Ask: ${fmt(s.bid, s.bid<1?6:2)} / ${fmt(s.ask, s.ask<1?6:2)}`,
    `↔️ Spread: ${fmt(s.spreadBps,3)} bps`,
    `⚖️ Depth-Imbalance: ${fmt(s.imbalance*100,1)} % (${im})`, '',
    `${live ? `⚡ LIVE · Auto-Refresh ${Math.round(refreshMs/1000)}s` : '⏸ Live aus'}`,
    '🧪 TCX: SHADOW_ONLY'
  ].join('\n');
}

function renderTcx(s) {
  const liquidity = s.spreadBps < 1 ? 'TIGHT' : s.spreadBps < 4 ? 'NORMAL' : 'WIDE';
  const flow = s.imbalance > 0.15 ? 'BID_PRESSURE' : s.imbalance < -0.15 ? 'ASK_PRESSURE' : 'BALANCED';
  const move = Math.abs(s.changePct) < 1 ? 'LOW' : Math.abs(s.changePct) < 4 ? 'MEDIUM' : 'HIGH';
  return [
    `🧠 TCX · ${s.symbol.replace('USDT','/USDT')}`, '',
    'OBSERVED',
    `• Liquidity: ${liquidity}`,
    `• Orderbook flow: ${flow}`,
    `• 24h move magnitude: ${move}`,
    `• Spread: ${fmt(s.spreadBps,3)} bps`,
    `• Depth imbalance: ${fmt(s.imbalance*100,1)} %`, '',
    'EPISTEMIC STATUS',
    '• Market snapshot: OBSERVED',
    '• Mechanism attribution: NOT INFERRED HERE',
    '• Trading action: ABSTAIN / SHADOW_ONLY', '',
    `timestamp: ${new Date(s.timestamp).toISOString()}`,
    `availableAt: ${new Date(s.availableAt).toISOString()}`,
    `source: ${s.source}`,
    `version: ${s.version}`
  ].join('\n');
}

async function ack(id, text) { try { await tg('answerCallbackQuery', { callback_query_id:id, text, show_alert:false }); } catch {} }

async function showStart(chatId, messageId) {
  sessions.delete(String(chatId));
  const payload = { chat_id:chatId, text:startText(), reply_markup:startKeyboard() };
  if (messageId) await tg('editMessageText', { ...payload, message_id:messageId });
  else await tg('sendMessage', payload);
}

async function showMarket(chatId, messageId, symbol, live) {
  const s = await snapshot(symbol);
  await tg('editMessageText', { chat_id:chatId, message_id:messageId, text:renderMarket(s,live), reply_markup:marketKeyboard(symbol,live) });
  sessions.set(String(chatId), { chatId, messageId, symbol, live, view:'MARKET', lastRefresh:Date.now() });
}

async function showTcx(chatId, messageId, symbol) {
  const s = await snapshot(symbol);
  const live = sessions.get(String(chatId))?.live === true;
  await tg('editMessageText', { chat_id:chatId, message_id:messageId, text:renderTcx(s), reply_markup:tcxKeyboard(symbol,live) });
  sessions.set(String(chatId), { chatId, messageId, symbol, live, view:'TCX', lastRefresh:Date.now() });
}

function parseAction(data='') {
  if (data === 'back') return { kind:'BACK' };
  const p = String(data).split(':');
  if (p[0] === 'market' && p[1]) return { kind:'MARKET', symbol:p[1] };
  if (p[0] === 'refresh' && p[1]) return { kind:'REFRESH', symbol:p[1] };
  if (p[0] === 'tcx' && p[1]) return { kind:'TCX', symbol:p[1] };
  if (p[0] === 'live' && p[1] && (p[2] === 'on' || p[2] === 'off')) return { kind:'LIVE', symbol:p[1], enabled:p[2] === 'on' };
  return { kind:'UNKNOWN' };
}

async function handle(update) {
  const msg = update?.message;
  if (msg?.chat?.id !== undefined && typeof msg.text === 'string' && msg.text.trim().startsWith('/start')) {
    if (!permitted(msg.chat.id)) return;
    await showStart(msg.chat.id); return;
  }
  const q = update?.callback_query;
  if (!q?.id || q?.message?.chat?.id === undefined || q?.message?.message_id === undefined) return;
  const chatId = q.message.chat.id, messageId = q.message.message_id;
  if (!permitted(chatId)) { await ack(q.id,'Nicht freigegeben'); return; }
  const a = parseAction(q.data);
  try {
    if (a.kind === 'BACK') { await showStart(chatId,messageId); await ack(q.id); return; }
    if (a.kind === 'UNKNOWN' || !a.symbol || !bySymbol.has(a.symbol)) { await ack(q.id,'Unbekannte Aktion'); return; }
    if (a.kind === 'MARKET' || a.kind === 'REFRESH') { await showMarket(chatId,messageId,a.symbol,sessions.get(String(chatId))?.live === true); await ack(q.id); return; }
    if (a.kind === 'LIVE') { await showMarket(chatId,messageId,a.symbol,a.enabled); await ack(q.id,a.enabled?'Live aktiviert':'Live deaktiviert'); return; }
    if (a.kind === 'TCX') { await showTcx(chatId,messageId,a.symbol); await ack(q.id); return; }
  } catch (err) {
    console.error('callback error', err instanceof Error ? err.message : String(err));
    await ack(q.id,'Live-Daten gerade nicht verfügbar');
  }
}

async function poll() {
  while (running) {
    try {
      const updates = await tg('getUpdates', { offset, timeout:25, allowed_updates:['message','callback_query'] }) || [];
      for (const u of updates) { offset = Math.max(offset, Number(u.update_id)+1); await handle(u); }
    } catch (err) {
      console.error('poll error', err instanceof Error ? err.message : String(err));
      await sleep(1500);
    }
  }
}

async function refresher() {
  while (running) {
    await sleep(1000);
    const now = Date.now();
    for (const [key,s] of [...sessions]) {
      if (!s.live || now - s.lastRefresh < refreshMs) continue;
      try {
        if (s.view === 'TCX') await showTcx(s.chatId,s.messageId,s.symbol);
        else await showMarket(s.chatId,s.messageId,s.symbol,true);
      } catch (err) {
        console.error('refresh error', err instanceof Error ? err.message : String(err));
        const cur = sessions.get(key); if (cur) cur.lastRefresh = now;
      }
    }
  }
}

const port = Number(process.env.PORT || 8080);
const server = http.createServer((req,res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, {'content-type':'application/json'});
    res.end(JSON.stringify({ok:true, service:'TCX Telegram', execution:'SHADOW_ONLY', markets:markets.map(x=>x.symbol), sessions:sessions.size}));
    return;
  }
  res.writeHead(404); res.end('not found');
});
server.listen(port, '0.0.0.0', () => console.log(`health server :${port}`));

process.on('SIGINT', () => { running=false; server.close(); });
process.on('SIGTERM', () => { running=false; server.close(); });

const me = await tg('getMe', {});
console.log(JSON.stringify({
  service:'TCX Telegram UI', botUsername:me?.username || 'UNKNOWN', markets:markets.map(x=>x.symbol),
  refreshMs, execution:'SHADOW_ONLY', allowedChats:allowedChats.size || 'ALL', recommendedReplicas:1,
  marketDataHosts:binanceBases.map(x => new URL(x).host)
}, null, 2));
await tg('deleteWebhook', { drop_pending_updates:false });
await Promise.all([poll(), refresher()]);
