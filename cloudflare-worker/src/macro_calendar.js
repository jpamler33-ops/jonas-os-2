const BLS_ICS_URL = "https://www.bls.gov/schedule/news_release/bls.ics";
const FED_FOMC_URL = "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm";

const FOMC_DECISION_DATES = [
  "2026-01-28","2026-03-18","2026-04-29","2026-06-17",
  "2026-07-29","2026-09-16","2026-10-28","2026-12-09",
  "2027-01-27","2027-03-17","2027-04-28","2027-06-09",
  "2027-07-28","2027-09-15","2027-10-27","2027-12-08"
];

function tzOffsetMs(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year:"numeric",month:"2-digit",day:"2-digit",
    hour:"2-digit",minute:"2-digit",second:"2-digit",
    hourCycle:"h23"
  }).formatToParts(date);
  const p=Object.fromEntries(parts.filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
  const asUTC=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);
  return asUTC-date.getTime();
}

function wallTimeToUtc(year,month,day,hour,minute,second=0,timeZone="America/New_York") {
  const wall=Date.UTC(year,month-1,day,hour,minute,second);
  let guess=new Date(wall);
  let offset=tzOffsetMs(guess,timeZone);
  guess=new Date(wall-offset);
  offset=tzOffsetMs(guess,timeZone);
  return wall-offset;
}

function parseDateValue(value, params="") {
  const v=String(value||"").trim();
  const m=v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if(!m) return null;
  const [,Y,M,D,h,min,s="00",z]=m;
  if(z) return Date.UTC(+Y,+M-1,+D,+h,+min,+s);
  const tz=(params.match(/TZID=([^;:]+)/i)||[])[1] || "America/New_York";
  try { return wallTimeToUtc(+Y,+M,+D,+h,+min,+s,tz); }
  catch { return Date.UTC(+Y,+M-1,+D,+h,+min,+s); }
}

function unfoldIcs(text) {
  return String(text||"").replace(/\r\n/g,"\n").replace(/\n[ \t]/g,"");
}

function classifyBls(summary) {
  const s=String(summary||"").toLowerCase();
  if(s.includes("consumer price index")) return {category:"CPI",importance:"CRITICAL"};
  if(s.includes("employment situation")) return {category:"NFP_EMPLOYMENT",importance:"CRITICAL"};
  if(s.includes("producer price index")) return {category:"PPI",importance:"HIGH"};
  if(s.includes("job openings and labor turnover") || s.includes("jolts")) return {category:"JOLTS",importance:"HIGH"};
  if(s.includes("employment cost index")) return {category:"ECI",importance:"HIGH"};
  return null;
}

export function parseBlsIcs(text) {
  const unfolded=unfoldIcs(text);
  const blocks=unfolded.split("BEGIN:VEVENT").slice(1).map(x=>x.split("END:VEVENT")[0]);
  const out=[];
  for(const block of blocks) {
    const lines=block.split("\n");
    let summary="",uid="",dt=null;
    for(const line of lines) {
      if(line.startsWith("SUMMARY:")) summary=line.slice(8).trim();
      else if(line.startsWith("UID:")) uid=line.slice(4).trim();
      else if(line.startsWith("DTSTART")) {
        const i=line.indexOf(":");
        if(i>0) dt=parseDateValue(line.slice(i+1),line.slice(0,i));
      }
    }
    const cls=classifyBls(summary);
    if(!cls || !Number.isFinite(dt)) continue;
    out.push({
      eventKey:`BLS|${uid||summary}|${dt}`,
      eventTs:dt,
      name:summary,
      category:cls.category,
      importance:cls.importance,
      source:"BLS",
      sourceUrl:BLS_ICS_URL,
      beforeMin:cls.importance==="CRITICAL"?45:30,
      afterMin:cls.importance==="CRITICAL"?45:30,
      scheduled:true
    });
  }
  return out;
}

export async function fetchBlsMacroEvents() {
  const r=await fetch(BLS_ICS_URL,{
    headers:{"user-agent":"BTC-Trading-Center-MacroRadar/1.0"}
  });
  if(!r.ok) throw new Error(`BLS calendar HTTP ${r.status}`);
  return parseBlsIcs(await r.text());
}

export function fomcEvents() {
  return FOMC_DECISION_DATES.map(date=>{
    const [y,m,d]=date.split("-").map(Number);
    const eventTs=wallTimeToUtc(y,m,d,14,0,0,"America/New_York");
    return {
      eventKey:`FED|FOMC|${date}`,
      eventTs,
      name:"FOMC policy statement",
      category:"FOMC",
      importance:"CRITICAL",
      source:"FEDERAL_RESERVE",
      sourceUrl:FED_FOMC_URL,
      beforeMin:60,
      afterMin:90,
      scheduled:true
    };
  });
}

export async function fetchOfficialMacroEvents() {
  const now=Date.now();
  let bls=[],blsError=null;
  try { bls=await fetchBlsMacroEvents(); }
  catch(e) { blsError=e?.message||String(e); }
  const fed=fomcEvents();
  const min=now-90*86400000,max=now+550*86400000;
  const events=[...bls,...fed]
    .filter(e=>e.eventTs>=min&&e.eventTs<=max)
    .sort((a,b)=>a.eventTs-b.eventTs);
  return {events,blsError,fetchedAt:now};
}

export function macroRiskState(events, now=Date.now()) {
  const xs=(events||[]).map(e=>{
    const before=Number(e.beforeMin||30)*60000;
    const after=Number(e.afterMin||30)*60000;
    const delta=Number(e.eventTs)-Number(now);
    const active=now>=e.eventTs-before && now<=e.eventTs+after;
    return {...e,deltaMs:delta,active};
  }).sort((a,b)=>Math.abs(a.deltaMs)-Math.abs(b.deltaMs));

  const active=xs.filter(x=>x.active);
  const next=xs.filter(x=>x.eventTs>=now).sort((a,b)=>a.eventTs-b.eventTs)[0]||null;
  return {
    active:active.length>0,
    activeEvents:active,
    nextEvent:next,
    nearest:xs[0]||null
  };
}

export { BLS_ICS_URL, FED_FOMC_URL };
