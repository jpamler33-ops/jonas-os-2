export const TELEGRAM_NAVIGATION_V2_VERSION='v1-home-market-deep-dive';

const S=x=>String(x||'').trim().toUpperCase();
export function commandCenterHomeKeyboard(){return {inline_keyboard:[
 [{text:'◉ MÄRKTE',callback_data:'nav:markets'},{text:'⌁ FORECAST',callback_data:'cmd:forecast'}],
 [{text:'▤ PORTFOLIO',callback_data:'home:portfolio'},{text:'⌁ STATISTIK',callback_data:'home:stats_day'}],
 [{text:'▤ GLOBAL INTEL',callback_data:'home:news'},{text:'◇ SYSTEM',callback_data:'nav:system'}],
 [{text:'☰ ALLE FUNKTIONEN',callback_data:'commands'}]
]};}

export function marketOverviewKeyboard(symbol,{isFavorite=false}={}){const s=S(symbol);if(!s)throw new Error('symbol required');return {inline_keyboard:[
 [{text:'🧠 SUPERCHART',callback_data:`superchart:${s}:PRO:5m`},{text:'⌁ FORECAST',callback_data:`forecast:${s}`}],
 [{text:'◇ WARUM?',callback_data:`why:${s}`},{text:'⚠ RISIKO',callback_data:`nav:risk:${s}`}],
 [{text:'▦ DEEP DIVE',callback_data:`nav:deep:${s}`},{text:isFavorite?'★ WATCHLIST':'☆ WATCHLIST',callback_data:`fav:${s}`}],
 [{text:'↻ REFRESH',callback_data:`refresh:${s}`},{text:'⌂ HOME',callback_data:'home'}]
]};}

export function deepDiveKeyboard(symbol){const s=S(symbol);if(!s)throw new Error('symbol required');return {inline_keyboard:[
 [{text:'▥ CHART',callback_data:`chart:${s}:5m`},{text:'▦ MTF',callback_data:`mtf:${s}`}],
 [{text:'🐋 FLOW',callback_data:`flow:${s}`},{text:'🔥 LIQUIDATION',callback_data:`liqmap:${s}:5m`}],
 [{text:'◎ CONFLUENCE',callback_data:`confluence:${s}`},{text:'◫ X-RAY',callback_data:`xray:${s}`}],
 [{text:'⚡ EVENTS',callback_data:`events:${s}`},{text:'📐 ACCURACY',callback_data:`accuracy:${s}`}],
 [{text:'◉ ALERT',callback_data:`alerthelp:${s}`},{text:'⬅ MARKT',callback_data:`market:${s}`}],
 [{text:'⌂ HOME',callback_data:'home'}]
]};}

export function parseNavigationV2(data=''){const p=String(data).split(':');if(p[0]!=='nav')return null;if(p[1]==='markets')return {kind:'NAV_MARKETS'};if(p[1]==='system')return {kind:'NAV_SYSTEM'};if(p[1]==='deep'&&p[2])return {kind:'NAV_DEEP_DIVE',symbol:S(p[2])};if(p[1]==='risk'&&p[2])return {kind:'NAV_RISK',symbol:S(p[2])};return {kind:'NAV_UNKNOWN',raw:String(data)};}
