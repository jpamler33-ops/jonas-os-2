export const TELEGRAM_MUTATION_COMMANDS_VERSION="TCX_TELEGRAM_MUTATION_COMMANDS_V1";

function msg(err){ return err instanceof Error?err.message:String(err); }

export function createMutationCommandHandlers(deps={}){
  const {
    tg,
    normalizeSymbol,
    showShadowOrders,
    getShadowOrders,
    replaceShadowOrder,
    cancelShadowOrder,
    now=()=>Date.now(),
    persistShadowOms,
    isAuditHealthy=()=>false,
    appendInstitutionalAudit,
    shadowAuditPayload,
    showPlacedShadowOrder,
    shadowDefaultLatencyMs=120,
    getShadowOmsStatus=()=>({healthy:false,lastError:"unknown"}),
    placeShadowOrder,
    recordError=()=>{},
    recordOperation=()=>{},
    observability=null,
    showSorRoute,
    snapshot,
    createAlert,
    addTcXAlert,
    symbolLabel,
    fmt=(x)=>String(x),
    alertPreset,
    describeAlert,
    activeAlerts,
    clearAlerts
  }=deps;

  if(typeof tg!=="function") throw new Error("tg dependency required");
  if(typeof normalizeSymbol!=="function") throw new Error("normalizeSymbol dependency required");

  const presetHandler=preset=>async ({chatId,args,command})=>{
    const symbol=normalizeSymbol(args[0]||"");
    if(!symbol){
      await tg("sendMessage",{chat_id:chatId,text:"Beispiel: "+command+" BTC"});
      return;
    }
    const alert=alertPreset(symbol,preset);
    const added=await addTcXAlert(chatId,alert);
    await tg("sendMessage",{
      chat_id:chatId,
      text:added.added
        ? "🔔 "+describeAlert(alert)+"\n"+(added.persisted?"Persistent gespeichert.":"Temporär gespeichert.")
        : (added.reason==="DUPLICATE"?"Dieser Alarm existiert bereits.":"Alarm-Limit erreicht.")
    });
  };

  return {
    "/shadoworders":async ({chatId,args})=>{
      const symbol=args[0]?normalizeSymbol(args[0]):null;
      if(args[0]&&!symbol){
        await tg("sendMessage",{chat_id:chatId,text:"Beispiel: /shadoworders BTC"});
        return;
      }
      await showShadowOrders(chatId,symbol);
    },

    "/shadowcancel":async ({chatId,args})=>{
      const ref=String(args[0]||"").trim();
      if(!ref){
        await tg("sendMessage",{chat_id:chatId,text:"Beispiel: /shadowcancel sh_..."});
        return;
      }
      const orders=getShadowOrders();
      const matches=orders.filter(o=>o.id===ref||(ref.length>=8&&o.id.startsWith(ref)));
      if(matches.length!==1){
        await tg("sendMessage",{chat_id:chatId,text:matches.length?"Order-ID nicht eindeutig.":"Shadow-Order nicht gefunden."});
        return;
      }
      const idx=orders.findIndex(o=>o.id===matches[0].id);
      const before=orders[idx];
      const after=cancelShadowOrder(before,{at:now()});
      if(after.status===before.status){
        await tg("sendMessage",{chat_id:chatId,text:"Order "+before.id+" ist nicht mehr aktiv ("+before.status+")."});
        return;
      }
      replaceShadowOrder(idx,after);
      await persistShadowOms("cancelled");
      if(isAuditHealthy()) await appendInstitutionalAudit("TCX_SHADOW_ORDER_EVENT",shadowAuditPayload("CANCELLED",after));
      await showPlacedShadowOrder(chatId,after);
    },

    "/shadow":async ({chatId,args})=>{
      const symbol=normalizeSymbol(args[0]||"");
      const side=String(args[1]||"").toUpperCase();
      const notional=Number(String(args[2]||"").replace(",","."));
      const type=String(args[3]||"").toUpperCase();
      const limitPrice=type==="LIMIT"?Number(String(args[4]||"").replace(",",".")):null;
      const latencyRaw=type==="LIMIT"?args[5]:args[4];
      const latencyMs=latencyRaw==null?shadowDefaultLatencyMs:Number(latencyRaw);
      const valid=symbol&&["BUY","SELL"].includes(side)&&["MARKET","LIMIT"].includes(type)&&
        Number.isFinite(notional)&&notional>0&&notional<=1_000_000_000&&
        Number.isFinite(latencyMs)&&latencyMs>=0&&latencyMs<=5000&&
        (type!=="LIMIT"||(Number.isFinite(limitPrice)&&limitPrice>0));
      if(!valid){
        await tg("sendMessage",{chat_id:chatId,text:[
          "Syntax:",
          "/shadow BTC BUY 100 MARKET [latencyMs]",
          "/shadow BTC BUY 100 LIMIT 65000 [latencyMs]",
          "",
          "Das erzeugt ausschließlich eine virtuelle Shadow-Order."
        ].join("\n")});
        return;
      }
      const oms=getShadowOmsStatus();
      if(!oms.healthy){
        await tg("sendMessage",{chat_id:chatId,text:("Shadow OMS ist fail-closed deaktiviert: "+(oms.lastError||"state unhealthy")).slice(0,4096)});
        return;
      }
      try{
        const order=await placeShadowOrder({symbol,side,type,notionalQuote:notional,limitPrice,latencyMs});
        await showPlacedShadowOrder(chatId,order);
      }catch(err){
        const m=msg(err);
        recordError(observability,{scope:"command.shadow",message:m});
        recordOperation(observability,{name:"shadow_oms.place",ok:false,latencyMs:0,error:m});
        await tg("sendMessage",{chat_id:chatId,text:("Shadow-Order konnte nicht simuliert werden: "+m).slice(0,4096)});
      }
    },

    "/sor":async ({chatId,args})=>{
      const symbol=normalizeSymbol(args[0]||"");
      const side=String(args[1]||"").toUpperCase();
      const notional=Number(String(args[2]||"").replace(",","."));
      const valid=symbol&&["BUY","SELL"].includes(side)&&Number.isFinite(notional)&&notional>0&&notional<=1_000_000_000;
      if(!valid){
        await tg("sendMessage",{chat_id:chatId,text:[
          "Syntax:",
          "/sor BTC BUY 100",
          "/sor BTC SELL 100",
          "",
          "Counterfactual Shadow Route only. Keine echte Order."
        ].join("\n")});
        return;
      }
      try{
        await showSorRoute(chatId,{symbol,side,notionalQuote:notional});
      }catch(err){
        const m=msg(err);
        recordError(observability,{scope:"command.sor",message:m});
        recordOperation(observability,{name:"shadow_sor.route",ok:false,latencyMs:0,error:m});
        await tg("sendMessage",{chat_id:chatId,text:("Shadow SOR konnte nicht simuliert werden: "+m).slice(0,4096)});
      }
    },

    "/alert":async ({chatId,args})=>{
      const symbol=normalizeSymbol(args[0]||"");
      const target=Number(String(args[1]||"").replace(",","."));
      if(!symbol||!Number.isFinite(target)||target<=0){
        await tg("sendMessage",{chat_id:chatId,text:"Beispiel: /alert BTC 70000"});
        return;
      }
      try{
        const s=await snapshot(symbol);
        const direction=target>=s.price?"GTE":"LTE";
        const alert=createAlert({
          symbol,
          type:"PRICE",
          createdAt:now(),
          once:true,
          cooldownMs:0,
          conditions:[{path:"market.price",op:direction,value:target}],
          label:"Price target"
        });
        const added=await addTcXAlert(chatId,alert);
        const status=!added.added
          ? (added.reason==="DUPLICATE"?"Dieser Alarm existiert bereits.":"Maximal 50 Alarme pro Chat.")
          : (added.persisted?"Persistent gespeichert.":"Nur temporär gespeichert – State-Volume prüfen.");
        await tg("sendMessage",{
          chat_id:chatId,
          text:[
            "🔔 PREISALARM · "+symbolLabel(symbol)+"/USDT",
            "Ziel: "+fmt(target,target<1?6:2)+" USDT",
            "Aktuell: "+fmt(s.price,s.price<1?6:2)+" USDT",
            "Trigger: Preis "+(direction==="GTE"?"≥":"≤")+" Ziel","",
            status
          ].join("\n")
        });
      }catch{
        await tg("sendMessage",{chat_id:chatId,text:"Coin oder Live-Daten nicht verfügbar."});
      }
    },

    "/alertregime":presetHandler("REGIME"),
    "/alertstructure":presetHandler("STRUCTURE"),
    "/alertsafety":presetHandler("SAFETY"),
    "/alertcombo":presetHandler("COMPOSITE"),

    "/alertwitness":async ({chatId,args})=>{
      const symbol=normalizeSymbol(args[0]||"");
      const pct=Number(String(args[1]||"75").replace(",","."));
      if(!symbol||!Number.isFinite(pct)||pct<0||pct>100){
        await tg("sendMessage",{chat_id:chatId,text:"Beispiel: /alertwitness BTC 75"});
        return;
      }
      const alert=alertPreset(symbol,"WITNESS",{witnessPct:pct});
      const added=await addTcXAlert(chatId,alert);
      await tg("sendMessage",{chat_id:chatId,text:added.added?"🔔 "+describeAlert(alert):"Alarm nicht angelegt: "+added.reason});
    },

    "/alertmemory":async ({chatId,args})=>{
      const symbol=normalizeSymbol(args[0]||"");
      const support=Number(args[1]||8);
      if(!symbol||!Number.isFinite(support)||support<1||support>1000){
        await tg("sendMessage",{chat_id:chatId,text:"Beispiel: /alertmemory BTC 8"});
        return;
      }
      const alert=alertPreset(symbol,"MEMORY",{memorySupport:support});
      const added=await addTcXAlert(chatId,alert);
      await tg("sendMessage",{chat_id:chatId,text:added.added?"🔔 "+describeAlert(alert):"Alarm nicht angelegt: "+added.reason});
    },

    "/alerts":async ({chatId})=>{
      const list=activeAlerts(chatId);
      const text=list.length
        ? ["🔔 Aktive TCX Alerts","",...list.map((a,i)=>(i+1)+". "+describeAlert(a))].join("\n")
        : "🔔 Keine aktiven Alarme.";
      await tg("sendMessage",{chat_id:chatId,text});
    },

    "/clearalerts":async ({chatId})=>{
      const persisted=await clearAlerts(chatId);
      await tg("sendMessage",{
        chat_id:chatId,
        text:persisted?"🔕 Alle Alarme gelöscht.":"🔕 Alarme gelöscht, aber State-Volume ist nicht schreibbar."
      });
    }
  };
}
