const FRED_GRAPH="https://fred.stlouisfed.org/graph/fredgraph.csv";

const SERIES = {
  SP500:{kind:"risk_asset",label:"S&P 500"},
  NASDAQCOM:{kind:"risk_asset",label:"NASDAQ Composite"},
  VIXCLS:{kind:"volatility",label:"VIX"},
  DGS2:{kind:"rate",label:"US 2Y Treasury"},
  DGS10:{kind:"rate",label:"US 10Y Treasury"},
  DTWEXBGS:{kind:"usd",label:"Broad U.S. Dollar Index"}
};

function parseFredCsv(text, id) {
  const lines=String(text||"").trim().split(/\r?\n/);
  if(lines.length<2) return [];
  const out=[];
  for(const line of lines.slice(1)) {
    const comma=line.indexOf(",");
    if(comma<0) continue;
    const date=line.slice(0,comma).trim();
    const raw=line.slice(comma+1).trim();
    const value=Number(raw);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(value)) continue;
    const ts=Date.parse(date+"T00:00:00Z");
    if(Number.isFinite(ts)) out.push({series:id,date,ts,value});
  }
  return out.sort((a,b)=>a.ts-b.ts);
}

async function fetchFredSeries(id) {
  const url=`${FRED_GRAPH}?id=${encodeURIComponent(id)}`;
  const r=await fetch(url,{
    headers:{"accept":"text/csv","user-agent":"BTC-Trading-Center-MacroContext/1.0"}
  });
  if(!r.ok) throw new Error(`FRED ${id} HTTP ${r.status}`);
  return parseFredCsv(await r.text(),id);
}

export async function fetchMacroMarketContext() {
  const ids=Object.keys(SERIES);
  const settled=await Promise.allSettled(ids.map(id=>fetchFredSeries(id)));
  const rows=[],errors=[];
  for(let i=0;i<settled.length;i++) {
    const id=ids[i],res=settled[i];
    if(res.status!=="fulfilled") {
      errors.push({series:id,error:res.reason?.message||String(res.reason)});
      continue;
    }
    const xs=res.value;
    if(!xs.length) {
      errors.push({series:id,error:"no_finite_observations"});
      continue;
    }
    const last=xs.at(-1),prev=xs.at(-2)||null;
    const meta=SERIES[id];
    let change=null;
    if(prev && prev.value!==0) {
      change=meta.kind==="rate"
        ? (last.value-prev.value)*100
        : (last.value/prev.value-1);
    }
    rows.push({
      series:id,label:meta.label,kind:meta.kind,
      observationTs:last.ts,observationDate:last.date,value:last.value,
      previousValue:prev?.value??null,change,
      source:"fred"
    });
  }
  return {fetchedAt:Date.now(),rows,errors};
}

export { SERIES, FRED_GRAPH };
