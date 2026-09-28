export const TELEGRAM_READ_COMMANDS_VERSION="TCX_TELEGRAM_READ_COMMANDS_V1";

function message(err){ return err instanceof Error?err.message:String(err); }

export function createReadCommandHandlers(deps={}){
  const {
    tg,
    helpText,
    normalizeSymbol,
    showStart,
    showCommandMenu,
    showFavorites,
    showCompare,
    showMarket,
    showChart,
    showStructure,
    showObservability,
    showChaos,
    showOms,
    showShadowPortfolio,
    showTradeDiscoveryDiagnostics,
    showShadowTradeStats,
    showShadowCapitalAcademy,
    showShadowTrainingCoach,
    showStrategyLeague,
    showExecutionResearch,
    showVenueQuality,
    showSorStatus,
    showRelease,
    showFabric,
    parseReplayTime,
    showReplay,
    showAudit,
    showWitness,
    showEngine,
    showForecast,
    showIntelligence,
    showMemory,
    showEvidence,
    showEvidenceHistory,
    showValidity,
    showDataStatus,
    recordError=()=>{},
    recordOperation=()=>{},
    observability=null
  }=deps;

  if(typeof tg!=="function") throw new Error("tg dependency required");
  if(typeof normalizeSymbol!=="function") throw new Error("normalizeSymbol dependency required");

  const executionLab=async ({chatId,args})=>{
    const symbol=normalizeSymbol(args[0]||"");
    const side=args[1]?String(args[1]).toUpperCase():null;
    if(!symbol||(side&&!["BUY","SELL"].includes(side))){
      await tg("sendMessage",{chat_id:chatId,text:"Beispiel: /executionlab BTC BUY"});
      return;
    }
    try{ await showExecutionResearch(chatId,{symbol,side}); }
    catch(err){
      const msg=message(err);
      recordError(observability,{scope:"command.executionlab",message:msg});
      recordOperation(observability,{name:"execution_research_lab",ok:false,latencyMs:0,error:msg});
      await tg("sendMessage",{chat_id:chatId,text:("Execution Research Lab gerade nicht verfügbar: "+msg).slice(0,4096)});
    }
  };

  const venueQuality=async ({chatId,args})=>{
    const symbol=normalizeSymbol(args[0]||"");
    const side=String(args[1]||"BUY").toUpperCase();
    const notional=args[2]==null?1000:Number(String(args[2]).replace(",","."));
    if(!symbol||!["BUY","SELL"].includes(side)||!Number.isFinite(notional)||notional<=0){
      await tg("sendMessage",{chat_id:chatId,text:"Beispiel: /venuequality BTC BUY 1000"});
      return;
    }
    try{ await showVenueQuality(chatId,{symbol,side,notionalQuote:notional}); }
    catch(err){
      const msg=message(err);
      recordError(observability,{scope:"command.venuequality",message:msg});
      await tg("sendMessage",{chat_id:chatId,text:("Venue Quality Memory gerade nicht verfügbar: "+msg).slice(0,4096)});
    }
  };

  const symbolResearch=(command,example,show,errorText,scope)=>async ({chatId,args})=>{
    const symbol=normalizeSymbol(args[0]||"");
    if(!symbol){
      await tg("sendMessage",{chat_id:chatId,text:"Beispiel: "+example});
      return;
    }
    try{ await show(chatId,symbol); }
    catch(err){
      const msg=message(err);
      if(scope) recordError(observability,{scope,message:msg});
      console.error(command+" command error",msg);
      const diagnostic=scope==='command.forecast'
        ? errorText+"\nDiagnose: "+msg
        : errorText;
      await tg("sendMessage",{chat_id:chatId,text:diagnostic.slice(0,4096)});
    }
  };

  return {
    "/start":async ({chatId})=>showStart(chatId),
    "/help":async ({chatId})=>tg("sendMessage",{chat_id:chatId,text:helpText()}),
    "/favorites":async ({chatId})=>showFavorites(chatId),
    "/compare":async ({chatId})=>showCompare(chatId,null),

    "/data":async ({chatId})=>{
      try{ await showDataStatus(chatId,null); }
      catch(err){
        const msg=message(err);
        recordError(observability,{scope:"command.data",message:msg});
        await tg("sendMessage",{chat_id:chatId,text:"Data-Status gerade nicht verfügbar."});
      }
    },

    "/coin":async ({chatId,args})=>{
      const symbol=normalizeSymbol(args[0]||"");
      if(!symbol){
        await tg("sendMessage",{chat_id:chatId,text:"Beispiel: /coin BTC"});
        return;
      }
      try{ await showMarket(chatId,null,symbol,false); }
      catch{
        await tg("sendMessage",{chat_id:chatId,text:"Kein Binance-USDT-Markt für "+(args[0]||symbol)+" gefunden."});
      }
    },

    "/chart":async ({chatId,args})=>{
      const symbol=normalizeSymbol(args[0]||"");
      const interval=["1m","5m","15m","1h","4h"].includes(args[1])?args[1]:"5m";
      if(!symbol){
        await tg("sendMessage",{chat_id:chatId,text:"Beispiel: /chart BTC 5m"});
        return;
      }
      try{ await showChart(chatId,symbol,interval); }
      catch(err){
        console.error("chart command error",message(err));
        await tg("sendMessage",{chat_id:chatId,text:"Chart-Daten gerade nicht verfügbar."});
      }
    },

    "/structure":async ({chatId,args})=>{
      const symbol=normalizeSymbol(args[0]||"");
      if(!symbol){
        await tg("sendMessage",{chat_id:chatId,text:"Beispiel: /structure BTC"});
        return;
      }
      try{ await showStructure(chatId,symbol); }
      catch(err){
        console.error("structure command error",message(err));
        await tg("sendMessage",{chat_id:chatId,text:"Struktur-Daten gerade nicht verfügbar."});
      }
    },

    "/obs":async ({chatId})=>{
      try{ await showObservability(chatId); }
      catch(err){
        const msg=message(err);
        recordError(observability,{scope:"command.obs",message:msg});
        await tg("sendMessage",{chat_id:chatId,text:"Observability gerade nicht verfügbar."});
      }
    },

    "/chaos":async ({chatId,args})=>{
      try{ await showChaos(chatId,args[0]||null); }
      catch(err){
        const msg=message(err);
        recordError(observability,{scope:"command.chaos",message:msg});
        await tg("sendMessage",{chat_id:chatId,text:"Chaos Harness gerade nicht verfügbar."});
      }
    },

    "/oms":async ({chatId})=>{
      try{ await showOms(chatId); }
      catch(err){
        const msg=message(err);
        recordError(observability,{scope:"command.oms",message:msg});
        await tg("sendMessage",{chat_id:chatId,text:"Shadow OMS gerade nicht verfügbar."});
      }
    },

    "/portfolio":async ({chatId})=>{
      try{ await showShadowPortfolio(chatId); }
      catch(err){
        const msg=message(err);
        recordError(observability,{scope:"command.portfolio",message:msg});
        await tg("sendMessage",{chat_id:chatId,text:"Shadow-Portfolio gerade nicht verfügbar."});
      }
    },
    "/why_not_trade":async ({chatId})=>{
      try{ await showTradeDiscoveryDiagnostics(chatId); }
      catch(err){
        const msg=message(err);
        recordError(observability,{scope:"command.why_not_trade",message:msg});
        await tg("sendMessage",{chat_id:chatId,text:"Trade Discovery Diagnostics gerade nicht verfügbar."});
      }
    },
    "/whynottrade":async ({chatId})=>{
      try{ await showTradeDiscoveryDiagnostics(chatId); }
      catch(err){
        const msg=message(err);
        recordError(observability,{scope:"command.whynottrade",message:msg});
        await tg("sendMessage",{chat_id:chatId,text:"Trade Discovery Diagnostics gerade nicht verfügbar."});
      }
    },
    "/trades":async ({chatId})=>{
      try{ await showShadowPortfolio(chatId); }
      catch(err){
        const msg=message(err);
        recordError(observability,{scope:"command.trades",message:msg});
        await tg("sendMessage",{chat_id:chatId,text:"Shadow-Portfolio gerade nicht verfügbar."});
      }
    },

    "/stats":async ({chatId})=>{
      try{ await showShadowTradeStats(chatId,null,"DAY"); }
      catch(err){
        const msg=message(err);
        recordError(observability,{scope:"command.stats",message:msg});
        await tg("sendMessage",{chat_id:chatId,text:"Trade-Statistik gerade nicht verfügbar."});
      }
    },
    "/daystats":async ({chatId})=>{
      try{ await showShadowTradeStats(chatId,null,"DAY"); }
      catch(err){
        const msg=message(err);
        recordError(observability,{scope:"command.daystats",message:msg});
        await tg("sendMessage",{chat_id:chatId,text:"Tagesstatistik gerade nicht verfügbar."});
      }
    },
    "/weekstats":async ({chatId})=>{
      try{ await showShadowTradeStats(chatId,null,"WEEK"); }
      catch(err){
        const msg=message(err);
        recordError(observability,{scope:"command.weekstats",message:msg});
        await tg("sendMessage",{chat_id:chatId,text:"Wochenstatistik gerade nicht verfügbar."});
      }
    },
    "/monthstats":async ({chatId})=>{
      try{ await showShadowTradeStats(chatId,null,"MONTH"); }
      catch(err){
        const msg=message(err);
        recordError(observability,{scope:"command.monthstats",message:msg});
        await tg("sendMessage",{chat_id:chatId,text:"Monatsstatistik gerade nicht verfügbar."});
      }
    },

    "/academy":async ({chatId})=>{
      try{ await showShadowCapitalAcademy(chatId); }
      catch(err){
        const msg=message(err);
        recordError(observability,{scope:"command.academy",message:msg});
        await tg("sendMessage",{chat_id:chatId,text:"Capital Academy gerade nicht verfügbar."});
      }
    },
    "/challenge":async ({chatId})=>{
      try{ await showShadowCapitalAcademy(chatId); }
      catch(err){
        const msg=message(err);
        recordError(observability,{scope:"command.challenge",message:msg});
        await tg("sendMessage",{chat_id:chatId,text:"Trading-Challenge gerade nicht verfügbar."});
      }
    },

    "/coach":async ({chatId})=>{
      try{ await showShadowTrainingCoach(chatId); }
      catch(err){
        const msg=message(err);
        recordError(observability,{scope:"command.coach",message:msg});
        await tg("sendMessage",{chat_id:chatId,text:"Training Coach gerade nicht verfügbar."});
      }
    },
    "/training":async ({chatId})=>{
      try{ await showShadowTrainingCoach(chatId); }
      catch(err){
        const msg=message(err);
        recordError(observability,{scope:"command.training",message:msg});
        await tg("sendMessage",{chat_id:chatId,text:"Training Coach gerade nicht verfügbar."});
      }
    },

    "/league":async ({chatId})=>{
      try{ await showStrategyLeague(chatId); }
      catch(err){
        const msg=message(err);
        recordError(observability,{scope:"command.league",message:msg});
        await tg("sendMessage",{chat_id:chatId,text:"Strategy League gerade nicht verfügbar."});
      }
    },
    "/strategies":async ({chatId})=>{
      try{ await showStrategyLeague(chatId); }
      catch(err){
        const msg=message(err);
        recordError(observability,{scope:"command.strategies",message:msg});
        await tg("sendMessage",{chat_id:chatId,text:"Strategy League gerade nicht verfügbar."});
      }
    },

    "/executionlab":executionLab,
    "/erl":executionLab,
    "/venuequality":venueQuality,
    "/vqm":venueQuality,

    "/sorstatus":async ({chatId,args})=>{
      const symbol=args[0]?normalizeSymbol(args[0]):"BTCUSDT";
      if(args[0]&&!symbol){
        await tg("sendMessage",{chat_id:chatId,text:"Beispiel: /sorstatus BTC"});
        return;
      }
      try{ await showSorStatus(chatId,symbol); }
      catch(err){
        const msg=message(err);
        recordError(observability,{scope:"command.sorstatus",message:msg});
        await tg("sendMessage",{chat_id:chatId,text:("SOR-Status gerade nicht verfügbar: "+msg).slice(0,4096)});
      }
    },

    "/release":async ({chatId})=>{
      try{ await showRelease(chatId); }
      catch(err){
        console.error("release command error",message(err));
        await tg("sendMessage",{chat_id:chatId,text:"Release Registry gerade nicht verfügbar."});
      }
    },

    "/fabric":async ({chatId})=>{
      try{ await showFabric(chatId); }
      catch(err){
        console.error("fabric command error",message(err));
        await tg("sendMessage",{chat_id:chatId,text:"Market Data Fabric gerade nicht verfügbar."});
      }
    },

    "/replay":async ({chatId,args})=>{
      const symbol=normalizeSymbol(args[0]||"");
      const asOf=parseReplayTime(args.slice(1).join(" "));
      if(!symbol||asOf==null){
        await tg("sendMessage",{chat_id:chatId,text:"Beispiel: /replay BTC 2026-09-27T14:30:00Z"});
        return;
      }
      try{ await showReplay(chatId,symbol,asOf); }
      catch(err){
        console.error("replay command error",message(err));
        await tg("sendMessage",{chat_id:chatId,text:"PIT-Replay gerade nicht verfügbar."});
      }
    },

    "/audit":async ({chatId})=>{
      try{ await showAudit(chatId); }
      catch(err){
        console.error("audit command error",message(err));
        await tg("sendMessage",{chat_id:chatId,text:"Institutional Kernel Audit gerade nicht verfügbar."});
      }
    },

    "/witness":symbolResearch("/witness","/witness BTC",showWitness,"Independent Witness Network gerade nicht verfügbar.","command.witness"),
    "/engine":symbolResearch("/engine","/engine BTC",showEngine,"MTL Engine gerade nicht verfügbar.","command.engine"),
    "/forecast":symbolResearch("/forecast","/forecast BTC",showForecast,"Forecast Intelligence gerade nicht verfügbar.","command.forecast"),
    "/intelligence":symbolResearch("/intelligence","/intelligence BTC",showIntelligence,"Intelligence-Status gerade nicht verfügbar.","command.intelligence"),
    "/memory":symbolResearch("/memory","/memory BTC",showMemory,"Episode Memory gerade nicht verfügbar.","command.memory"),

    "/evidence":async ({chatId,args})=>{
      const symbol=normalizeSymbol(args[0]||"");
      if(!symbol){
        await tg("sendMessage",{chat_id:chatId,text:"Beispiel: /evidence BTC"});
        return;
      }
      try{ await showEvidence(chatId,null,symbol); }
      catch(err){
        console.error("evidence command error",message(err));
        await tg("sendMessage",{chat_id:chatId,text:"Evidence-Diagnostik gerade nicht verfügbar."});
      }
    },

    "/history":async ({chatId,args})=>{
      const symbol=normalizeSymbol(args[0]||"");
      if(!symbol){
        await tg("sendMessage",{chat_id:chatId,text:"Beispiel: /history BTC"});
        return;
      }
      try{ await showEvidenceHistory(chatId,null,symbol); }
      catch(err){
        console.error("history command error",message(err));
        await tg("sendMessage",{chat_id:chatId,text:"Evidence-Historie gerade nicht verfügbar."});
      }
    },

    "/validity":async ({chatId,args})=>{
      const symbol=normalizeSymbol(args[0]||"");
      if(!symbol){
        await tg("sendMessage",{chat_id:chatId,text:"Beispiel: /validity BTC"});
        return;
      }
      try{ await showValidity(chatId,null,symbol); }
      catch(err){
        console.error("validity command error",message(err));
        await tg("sendMessage",{chat_id:chatId,text:"Research-Validity gerade nicht verfügbar."});
      }
    }
  };
}
