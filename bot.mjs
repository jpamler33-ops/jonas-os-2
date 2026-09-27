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
const alertCheckMs = Math.max(10000, Number(process.env.TCX_TELEGRAM_ALERT_CHECK_MS || 15000));
const allowedChats = new Set((process.env.TCX_TELEGRAM_ALLOWED_CHATS || '').split(',').map(x => x.trim()).filter(Boolean));
const requestedSymbols = (process.env.TCX_TELEGRAM_SYMBOLS ||
  'BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,XRPUSDT,DOGEUSDT,ADAUSDT,LINKUSDT,AVAXUSDT,DOTUSDT,LTCUSDT,TRXUSDT')
  .split(',').map(x => x.trim().toUpperCase()).filter(Boolean);

const MARKET_META = {
  BTCUSDT:['₿','BTC'], ETHUSDT:['Ξ','ETH'], SOLUSDT:['◎','SOL'], BNBUSDT:['🟡','BNB'],
  XRPUSDT:['✕','XRP'], DOGEUSDT:['Ð','DOGE'], ADAUSDT:['₳','ADA'], LINKUSDT:['⬡','LINK'],
  AVAXUSDT:['🔺','AVAX'], DOTUSDT:['●','DOT'], LTCUSDT:['Ł','LTC'], TRXUSDT:['◆','TRX']
};

const markets = requestedSymbols.map(symbol => ({
  symbol,
  icon: MARKET_META[symbol]?.[0] || '•',
  label: MARKET_META[symbol]?.[1] || symbol.replace('USDT','')
}));

const sessions = new Map();
const favorites = new Map();
const alerts = new Map();
let offset = 0;
let running = true;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const permitted = chatId => allowedChats.size === 0 || allowedChats.has(String(chatId));
const fmt = (n, max=2) => Number(n).toLocaleString('de-DE', { maximumFractionDigits:max });
const symbolOk = symbol => /^[A-Z0-9]{2,18}USDT$/.test(symbol);

function normalizeSymbol(input='') {
  const raw = String(input).trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
  if (!raw) return null;
  const symbol = raw.endsWith('USDT') ? raw : `${raw}USDT`;
  return symbolOk(symbol) ? symbol : null;
}

function symbolLabel(symbol) {
  return MARKET_META[symbol]?.[1] || symbol.replace('USDT','');
}

function symbolIcon(symbol) {
  return MARKET_META[symbol]?.[0] || '•';
}

function favoriteSet(chatId) {
  const key = String(chatId);
  if (!favorites.has(key)) favorites.set(key, new Set());
  return favorites.get(key);
}

function alertList(chatId) {
  const key = String(chatId);
  if (!alerts.has(key)) alerts.set(key, []);
  return alerts.get(key);
}

async function fetchJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'user-agent':'TCX-v2-SHADOW_ONLY', accept:'application/json' }
    });
    const body = await res.text();
    if (!res.ok) {
      const detail = body.slice(0,180).replace(/\s+/g,' ');
      throw new Error(`HTTP ${res.status} ${new URL(url).host}: ${detail}`);
    }
    try { return JSON.parse(body); }
    catch { throw new Error(`Invalid JSON from ${new URL(url).host}`); }
  } finally {
    clearTimeout(timer);
  }
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

async function fetchKlines(symbol, interval, limit=30) {
  const encoded = encodeURIComponent(symbol);
  const allowed = new Set(['1m','5m','15m','1h']);
  if (!allowed.has(interval)) throw new Error('Unsupported interval');
  const errors = [];
  for (const base of binanceBases) {
    try {
      const rows = await fetchJson(`${base}/api/v3/klines?symbol=${encoded}&interval=${interval}&limit=${limit}`);
      if (!Array.isArray(rows) || rows.length < 2) throw new Error('Insufficient kline data');
      return { rows, base };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${base}: ${msg}`);
    }
  }
  throw new Error(`Klines unavailable: ${errors.join(' | ')}`);
}

async function tg(method, body) {
  const res = await fetch(`${telegramApi}/${method}`, {
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify(body)
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
  for (let i=0;i<markets.length;i+=2) {
    rows.push(markets.slice(i,i+2).map(m => ({
      text:`${m.icon} ${m.label}`,
      callback_data:`market:${m.symbol}`
    })));
  }
  rows.push([
    { text:'⭐ Favoriten', callback_data:'favorites' },
    { text:'🔎 Suche', callback_data:'searchhelp' }
  ]);
  return { inline_keyboard: rows };
}

function marketKeyboard(chatId, symbol, live) {
  const isFav = favoriteSet(chatId).has(symbol);
  return { inline_keyboard:[
    [
      { text:'🔄 Aktualisieren', callback_data:`refresh:${symbol}` },
      { text:live?'⏸ Live aus':'⚡ Live an', callback_data:`live:${symbol}:${live?'off':'on'}` }
    ],
    [
      { text:'1m', callback_data:`tf:${symbol}:1m` },
      { text:'5m', callback_data:`tf:${symbol}:5m` },
      { text:'15m', callback_data:`tf:${symbol}:15m` },
      { text:'1h', callback_data:`tf:${symbol}:1h` }
    ],
    [
      { text:isFav?'★ Favorit':'☆ Favorit', callback_data:`fav:${symbol}` },
      { text:'🔔 Alarm', callback_data:`alerthelp:${symbol}` },
      { text:'🧠 TCX', callback_data:`tcx:${symbol}` }
    ],
    [{ text:'⬅️ Zurück', callback_data:'back' }]
  ]};
}

function tcxKeyboard(symbol, live) {
  return { inline_keyboard:[
    [{ text:'📊 Markt', callback_data:`refresh:${symbol}` }],
    [
      { text:live?'⏸ Live aus':'⚡ Live an', callback_data:`live:${symbol}:${live?'off':'on'}` },
      { text:'⬅️ Zurück', callback_data:'back' }
    ]
  ]};
}

function timeframeKeyboard(symbol) {
  return { inline_keyboard:[
    [
      { text:'1m', callback_data:`tf:${symbol}:1m` },
      { text:'5m', callback_data:`tf:${symbol}:5m` },
      { text:'15m', callback_data:`tf:${symbol}:15m` },
      { text:'1h', callback_data:`tf:${symbol}:1h` }
    ],
    [
      { text:'📊 Markt', callback_data:`refresh:${symbol}` },
      { text:'🧠 TCX', callback_data:`tcx:${symbol}` }
    ],
    [{ text:'⬅️ Zurück', callback_data:'back' }]
  ]};
}

function favoritesKeyboard(chatId) {
  const syms = [...favoriteSet(chatId)];
  const rows = [];
  for (let i=0;i<syms.length;i+=2) {
    rows.push(syms.slice(i,i+2).map(symbol => ({
      text:`${symbolIcon(symbol)} ${symbolLabel(symbol)}`,
      callback_data:`market:${symbol}`
    })));
  }
  rows.push([{ text:'⬅️ Zurück', callback_data:'back' }]);
  return { inline_keyboard: rows };
}

async function snapshot(symbol) {
  const started = Date.now();
  const { ticker, book, depth, base } = await fetchMarketParts(symbol);
  const bids = (depth.bids || []).slice(0,10).map(([p,q]) => [Number(p),Number(q)]);
  const asks = (depth.asks || []).slice(0,10).map(([p,q]) => [Number(p),Number(q)]);
  const bid = Number(book.bidPrice);
  const ask = Number(book.askPrice);
  const mid = (bid + ask) / 2;
  const spreadBps = mid > 0 ? (ask - bid) / mid * 10000 : 0;
  const bidNotional = bids.reduce((s,[p,q]) => s + p*q, 0);
  const askNotional = asks.reduce((s,[p,q]) => s + p*q, 0);
  const total = bidNotional + askNotional;
  const imbalance = total > 0 ? (bidNotional - askNotional) / total : 0;
  const now = Date.now();
  return {
    symbol,
    price:Number(ticker.lastPrice),
    changePct:Number(ticker.priceChangePercent),
    high:Number(ticker.highPrice),
    low:Number(ticker.lowPrice),
    volumeQuote:Number(ticker.quoteVolume),
    bid, ask, spreadBps, imbalance,
    timestamp:now,
    availableAt:now,
    source:'BINANCE_PUBLIC_REST',
    version:'v3',
    provenance:`ticker24hr+bookTicker+depth20; host=${new URL(base).host}; fetched_ms=${now-started}`
  };
}

async function timeframeSnapshot(symbol, interval) {
  const started = Date.now();
  const { rows, base } = await fetchKlines(symbol, interval, 30);
  const firstOpen = Number(rows[0][1]);
  const lastClose = Number(rows[rows.length-1][4]);
  const high = Math.max(...rows.map(r => Number(r[2])));
  const low = Math.min(...rows.map(r => Number(r[3])));
  const quoteVolume = rows.reduce((s,r) => s + Number(r[7] || 0), 0);
  const movePct = firstOpen > 0 ? (lastClose-firstOpen)/firstOpen*100 : 0;
  const rangePct = firstOpen > 0 ? (high-low)/firstOpen*100 : 0;
  const now = Date.now();
  return {
    symbol, interval, bars:rows.length, firstOpen, lastClose, high, low, quoteVolume, movePct, rangePct,
    timestamp:Number(rows[rows.length-1][0]),
    availableAt:now,
    source:'BINANCE_PUBLIC_REST_KLINES',
    version:'v3',
    provenance:`klines30; interval=${interval}; host=${new URL(base).host}; fetched_ms=${now-started}`
  };
}

function startText() {
  return [
    '🧠 TCX v2 · Live Market','',
    'Wähle eine Währung oder nutze /coin BTC.','',
    'Live-Daten: Binance · Execution: SHADOW_ONLY',
    'Keine Order-Ausführung.'
  ].join('\n');
}

function helpText() {
  return [
    '🧠 TCX Bot · Befehle','',
    '/start – Hauptmenü',
    '/coin BTC – Coin direkt öffnen',
    '/favorites – Favoriten',
    '/alert BTC 70000 – einmaliger Preisalarm',
    '/alerts – aktive Preisalarme',
    '/clearalerts – alle Alarme löschen','',
    'Hinweis: Favoriten und Alarme liegen aktuell im Arbeitsspeicher und werden bei einem Railway-Neustart zurückgesetzt.',
    'Execution bleibt SHADOW_ONLY.'
  ].join('\n');
}

function renderMarket(s, live) {
  const dir = s.changePct >= 0 ? '▲' : '▼';
  const im = s.imbalance > 0.12 ? 'Bid-lastig' : s.imbalance < -0.12 ? 'Ask-lastig' : 'ausgeglichen';
  return [
    `📊 ${s.symbol.replace('USDT','/USDT')} · Binance`,'',
    `💰 ${fmt(s.price, s.price < 1 ? 6 : 2)} USDT`,
    `${dir} 24h: ${s.changePct >= 0 ? '+' : ''}${fmt(s.changePct,2)} %`,
    `↕️ 24h: ${fmt(s.low,2)} – ${fmt(s.high,2)}`,
    `📦 Quote-Volumen: ${fmt(s.volumeQuote,0)} USDT`,'',
    `📖 Bid / Ask: ${fmt(s.bid, s.bid<1?6:2)} / ${fmt(s.ask, s.ask<1?6:2)}`,
    `↔️ Spread: ${fmt(s.spreadBps,3)} bps`,
    `⚖️ Depth-Imbalance: ${fmt(s.imbalance*100,1)} % (${im})`,'',
    live ? `⚡ LIVE · Auto-Refresh ${Math.round(refreshMs/1000)}s` : '⏸ Live aus',
    '🧪 TCX: SHADOW_ONLY'
  ].join('\n');
}

function renderTimeframe(t) {
  const dir = t.movePct >= 0 ? '▲' : '▼';
  return [
    `🕯 ${t.symbol.replace('USDT','/USDT')} · ${t.interval}`,'',
    `${dir} 30 Kerzen: ${t.movePct >= 0 ? '+' : ''}${fmt(t.movePct,2)} %`,
    `Start: ${fmt(t.firstOpen,t.firstOpen<1?6:2)}`,
    `Letzter Close: ${fmt(t.lastClose,t.lastClose<1?6:2)}`,
    `High / Low: ${fmt(t.high,t.high<1?6:2)} / ${fmt(t.low,t.low<1?6:2)}`,
    `Range: ${fmt(t.rangePct,2)} %`,
    `Quote-Volumen: ${fmt(t.quoteVolume,0)} USDT`,'',
    'Status: OBSERVED / DERIVED',
    'Execution: SHADOW_ONLY'
  ].join('\n');
}

function renderTcx(s) {
  const liquidity = s.spreadBps < 1 ? 'TIGHT' : s.spreadBps < 4 ? 'NORMAL' : 'WIDE';
  const flow = s.imbalance > 0.15 ? 'BID_PRESSURE' : s.imbalance < -0.15 ? 'ASK_PRESSURE' : 'BALANCED';
  const move = Math.abs(s.changePct) < 1 ? 'LOW' : Math.abs(s.changePct) < 4 ? 'MEDIUM' : 'HIGH';
  return [
    `🧠 TCX · ${s.symbol.replace('USDT','/USDT')}`,'',
    'OBSERVED',
    `• Liquidity: ${liquidity}`,
    `• Orderbook flow: ${flow}`,
    `• 24h move magnitude: ${move}`,
    `• Spread: ${fmt(s.spreadBps,3)} bps`,
    `• Depth imbalance: ${fmt(s.imbalance*100,1)} %`,'',
    'EPISTEMIC STATUS',
    '• Market snapshot: OBSERVED',
    '• Mechanism attribution: NOT INFERRED HERE',
    '• Trading action: ABSTAIN / SHADOW_ONLY','',
    `timestamp: ${new Date(s.timestamp).toISOString()}`,
    `availableAt: ${new Date(s.availableAt).toISOString()}`,
    `source: ${s.source}`,
    `version: ${s.version}`
  ].join('\n');
}

async function ack(id, text) {
  try { await tg('answerCallbackQuery', { callback_query_id:id, text, show_alert:false }); } catch {}
}

async function showStart(chatId, messageId) {
  sessions.delete(String(chatId));
  const payload = { chat_id:chatId, text:startText(), reply_markup:startKeyboard() };
  if (messageId) await tg('editMessageText', { ...payload, message_id:messageId });
  else await tg('sendMessage', payload);
}

async function showFavorites(chatId, messageId) {
  const syms = [...favoriteSet(chatId)];
  const text = syms.length
    ? `⭐ Favoriten\n\n${syms.map(s => `• ${symbolLabel(s)}/USDT`).join('\n')}`
    : '⭐ Noch keine Favoriten.\n\nÖffne einen Coin und tippe auf ☆ Favorit.';
  const payload = { chat_id:chatId, text, reply_markup:favoritesKeyboard(chatId) };
  if (messageId) await tg('editMessageText', { ...payload, message_id:messageId });
  else await tg('sendMessage', payload);
}

async function showMarket(chatId, messageId, symbol, live) {
  const s = await snapshot(symbol);
  const text = renderMarket(s,live);
  const reply_markup = marketKeyboard(chatId,symbol,live);
  if (messageId) {
    await tg('editMessageText', { chat_id:chatId, message_id:messageId, text, reply_markup });
    sessions.set(String(chatId), { chatId, messageId, symbol, live, view:'MARKET', lastRefresh:Date.now() });
  } else {
    const sent = await tg('sendMessage', { chat_id:chatId, text, reply_markup });
    sessions.set(String(chatId), { chatId, messageId:sent.message_id, symbol, live, view:'MARKET', lastRefresh:Date.now() });
  }
}

async function showTimeframe(chatId, messageId, symbol, interval) {
  const t = await timeframeSnapshot(symbol, interval);
  await tg('editMessageText', {
    chat_id:chatId,
    message_id:messageId,
    text:renderTimeframe(t),
    reply_markup:timeframeKeyboard(symbol)
  });
  const live = sessions.get(String(chatId))?.live === true;
  sessions.set(String(chatId), { chatId, messageId, symbol, live, view:'TIMEFRAME', interval, lastRefresh:Date.now() });
}

async function showTcx(chatId, messageId, symbol) {
  const s = await snapshot(symbol);
  const live = sessions.get(String(chatId))?.live === true;
  await tg('editMessageText', {
    chat_id:chatId,
    message_id:messageId,
    text:renderTcx(s),
    reply_markup:tcxKeyboard(symbol,live)
  });
  sessions.set(String(chatId), { chatId, messageId, symbol, live, view:'TCX', lastRefresh:Date.now() });
}

function parseAction(data='') {
  if (data === 'back') return { kind:'BACK' };
  if (data === 'favorites') return { kind:'FAVORITES' };
  if (data === 'searchhelp') return { kind:'SEARCH_HELP' };
  const p = String(data).split(':');
  if (p[0] === 'market' && p[1]) return { kind:'MARKET', symbol:p[1] };
  if (p[0] === 'refresh' && p[1]) return { kind:'REFRESH', symbol:p[1] };
  if (p[0] === 'tcx' && p[1]) return { kind:'TCX', symbol:p[1] };
  if (p[0] === 'fav' && p[1]) return { kind:'FAV', symbol:p[1] };
  if (p[0] === 'alerthelp' && p[1]) return { kind:'ALERT_HELP', symbol:p[1] };
  if (p[0] === 'tf' && p[1] && ['1m','5m','15m','1h'].includes(p[2])) return { kind:'TIMEFRAME', symbol:p[1], interval:p[2] };
  if (p[0] === 'live' && p[1] && (p[2] === 'on' || p[2] === 'off')) return { kind:'LIVE', symbol:p[1], enabled:p[2] === 'on' };
  return { kind:'UNKNOWN' };
}

async function handleCommand(msg) {
  const chatId = msg.chat.id;
  if (!permitted(chatId)) return true;
  const parts = msg.text.trim().split(/\s+/);
  const command = parts[0].split('@')[0].toLowerCase();

  if (command === '/start') {
    await showStart(chatId);
    return true;
  }

  if (command === '/help') {
    await tg('sendMessage',{ chat_id:chatId, text:helpText() });
    return true;
  }

  if (command === '/favorites') {
    await showFavorites(chatId);
    return true;
  }

  if (command === '/coin') {
    const symbol = normalizeSymbol(parts[1] || '');
    if (!symbol) {
      await tg('sendMessage',{ chat_id:chatId, text:'Beispiel: /coin BTC' });
      return true;
    }
    try {
      await showMarket(chatId,null,symbol,false);
    } catch {
      await tg('sendMessage',{ chat_id:chatId, text:`Kein Binance-USDT-Markt für ${parts[1] || symbol} gefunden.` });
    }
    return true;
  }

  if (command === '/alert') {
    const symbol = normalizeSymbol(parts[1] || '');
    const target = Number(String(parts[2] || '').replace(',','.'));
    if (!symbol || !Number.isFinite(target) || target <= 0) {
      await tg('sendMessage',{ chat_id:chatId, text:'Beispiel: /alert BTC 70000' });
      return true;
    }
    try {
      const s = await snapshot(symbol);
      const direction = target >= s.price ? 'ABOVE' : 'BELOW';
      const list = alertList(chatId);
      if (list.length >= 20) {
        await tg('sendMessage',{ chat_id:chatId, text:'Maximal 20 aktive Alarme pro Chat.' });
        return true;
      }
      list.push({ symbol, target, direction, createdAt:Date.now() });
      await tg('sendMessage',{
        chat_id:chatId,
        text:[
          `🔔 Alarm gesetzt: ${symbolLabel(symbol)}/USDT`,
          `Ziel: ${fmt(target,target<1?6:2)} USDT`,
          `Aktuell: ${fmt(s.price,s.price<1?6:2)} USDT`,
          `Richtung: ${direction === 'ABOVE' ? 'erreicht/übersteigt Ziel' : 'erreicht/unterschreitet Ziel'}`,'',
          'Hinweis: Alarm ist aktuell nicht persistent über Railway-Neustarts.'
        ].join('\n')
      });
    } catch {
      await tg('sendMessage',{ chat_id:chatId, text:'Coin oder Live-Daten nicht verfügbar.' });
    }
    return true;
  }

  if (command === '/alerts') {
    const list = alertList(chatId);
    const text = list.length
      ? ['🔔 Aktive Alarme','',...list.map((a,i) => `${i+1}. ${symbolLabel(a.symbol)} ${a.direction === 'ABOVE' ? '≥' : '≤'} ${fmt(a.target,a.target<1?6:2)} USDT`)].join('\n')
      : '🔔 Keine aktiven Alarme.';
    await tg('sendMessage',{ chat_id:chatId, text });
    return true;
  }

  if (command === '/clearalerts') {
    alerts.set(String(chatId),[]);
    await tg('sendMessage',{ chat_id:chatId, text:'🔕 Alle Preisalarme gelöscht.' });
    return true;
  }

  return false;
}

async function handle(update) {
  const msg = update?.message;
  if (msg?.chat?.id !== undefined && typeof msg.text === 'string' && msg.text.trim().startsWith('/')) {
    if (await handleCommand(msg)) return;
  }

  const q = update?.callback_query;
  if (!q?.id || q?.message?.chat?.id === undefined || q?.message?.message_id === undefined) return;
  const chatId = q.message.chat.id;
  const messageId = q.message.message_id;

  if (!permitted(chatId)) {
    await ack(q.id,'Nicht freigegeben');
    return;
  }

  const a = parseAction(q.data);
  try {
    if (a.kind === 'BACK') {
      await showStart(chatId,messageId);
      await ack(q.id);
      return;
    }
    if (a.kind === 'FAVORITES') {
      await showFavorites(chatId,messageId);
      await ack(q.id);
      return;
    }
    if (a.kind === 'SEARCH_HELP') {
      await ack(q.id,'Schreibe z. B. /coin BTC');
      return;
    }
    if (a.kind === 'UNKNOWN' || (a.symbol && !symbolOk(a.symbol))) {
      await ack(q.id,'Unbekannte Aktion');
      return;
    }
    if (a.kind === 'MARKET' || a.kind === 'REFRESH') {
      await showMarket(chatId,messageId,a.symbol,sessions.get(String(chatId))?.live === true);
      await ack(q.id);
      return;
    }
    if (a.kind === 'LIVE') {
      await showMarket(chatId,messageId,a.symbol,a.enabled);
      await ack(q.id,a.enabled?'Live aktiviert':'Live deaktiviert');
      return;
    }
    if (a.kind === 'TCX') {
      await showTcx(chatId,messageId,a.symbol);
      await ack(q.id);
      return;
    }
    if (a.kind === 'TIMEFRAME') {
      await showTimeframe(chatId,messageId,a.symbol,a.interval);
      await ack(q.id);
      return;
    }
    if (a.kind === 'FAV') {
      const set = favoriteSet(chatId);
      if (set.has(a.symbol)) set.delete(a.symbol); else set.add(a.symbol);
      await showMarket(chatId,messageId,a.symbol,sessions.get(String(chatId))?.live === true);
      await ack(q.id,set.has(a.symbol)?'Favorit gespeichert':'Favorit entfernt');
      return;
    }
    if (a.kind === 'ALERT_HELP') {
      await ack(q.id,`Nutze /alert ${symbolLabel(a.symbol)} PREIS`);
      return;
    }
  } catch (err) {
    console.error('callback error', err instanceof Error ? err.message : String(err));
    await ack(q.id,'Live-Daten gerade nicht verfügbar');
  }
}

async function poll() {
  while (running) {
    try {
      const updates = await tg('getUpdates',{
        offset,
        timeout:25,
        allowed_updates:['message','callback_query']
      }) || [];
      for (const u of updates) {
        offset = Math.max(offset,Number(u.update_id)+1);
        await handle(u);
      }
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
        else if (s.view === 'TIMEFRAME') await showTimeframe(s.chatId,s.messageId,s.symbol,s.interval || '5m');
        else await showMarket(s.chatId,s.messageId,s.symbol,true);
      } catch (err) {
        console.error('refresh error', err instanceof Error ? err.message : String(err));
        const cur = sessions.get(key);
        if (cur) cur.lastRefresh = now;
      }
    }
  }
}

async function alertWatcher() {
  while (running) {
    await sleep(alertCheckMs);
    const grouped = new Map();
    for (const [chatKey,list] of alerts) {
      for (const alert of list) {
        if (!grouped.has(alert.symbol)) grouped.set(alert.symbol,[]);
        grouped.get(alert.symbol).push({ chatKey, alert });
      }
    }

    for (const [symbol,items] of grouped) {
      let s;
      try { s = await snapshot(symbol); }
      catch (err) {
        console.error('alert snapshot error',symbol,err instanceof Error ? err.message : String(err));
        continue;
      }

      for (const { chatKey, alert } of items) {
        const hit = alert.direction === 'ABOVE' ? s.price >= alert.target : s.price <= alert.target;
        if (!hit) continue;

        try {
          await tg('sendMessage',{
            chat_id:chatKey,
            text:[
              `🔔 PREISALARM · ${symbolLabel(symbol)}/USDT`,
              `Ziel: ${fmt(alert.target,alert.target<1?6:2)} USDT`,
              `Aktuell: ${fmt(s.price,s.price<1?6:2)} USDT`,'',
              'TCX Execution: SHADOW_ONLY'
            ].join('\n')
          });
        } catch (err) {
          console.error('alert send error',err instanceof Error ? err.message : String(err));
        }

        const current = alertList(chatKey);
        alerts.set(chatKey,current.filter(x => x !== alert));
      }
    }
  }
}

const port = Number(process.env.PORT || 8080);
const server = http.createServer((req,res) => {
  if (req.url === '/health' || req.url === '/') {
    const activeAlerts = [...alerts.values()].reduce((n,x) => n+x.length,0);
    res.writeHead(200,{'content-type':'application/json'});
    res.end(JSON.stringify({
      ok:true,
      service:'TCX Telegram',
      execution:'SHADOW_ONLY',
      markets:markets.map(x => x.symbol),
      sessions:sessions.size,
      favorites:[...favorites.values()].reduce((n,x) => n+x.size,0),
      alerts:activeAlerts
    }));
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

server.listen(port,'0.0.0.0',() => console.log(`health server :${port}`));

process.on('SIGINT',() => { running=false; server.close(); });
process.on('SIGTERM',() => { running=false; server.close(); });

const me = await tg('getMe',{});
console.log(JSON.stringify({
  service:'TCX Telegram UI',
  botUsername:me?.username || 'UNKNOWN',
  markets:markets.map(x=>x.symbol),
  refreshMs,
  alertCheckMs,
  execution:'SHADOW_ONLY',
  allowedChats:allowedChats.size || 'ALL',
  recommendedReplicas:1,
  marketDataHosts:binanceBases.map(x => new URL(x).host)
},null,2));

await tg('deleteWebhook',{ drop_pending_updates:false });
await Promise.all([poll(),refresher(),alertWatcher()]);
