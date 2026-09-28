export const FLOW_RADAR_VIEW_VERSION='TCX_FLOW_RADAR_VIEW_V1';

function finite(v){
  if(v===null||v===undefined||v==='') return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function signed(v,d=2){
  const n=finite(v);
  if(n==null) return '—';
  return (n>0?'+':'')+n.toFixed(d);
}
function num(v,d=2){
  const n=finite(v);
  return n==null?'—':n.toFixed(d);
}
function pct(v,d=0){
  const n=finite(v);
  return n==null?'—':(n*100).toFixed(d)+'%';
}
function bar(v,max,width=10){
  const n=Math.max(0,finite(v)||0),m=Math.max(1e-12,finite(max)||0);
  const k=n<=0?0:Math.max(1,Math.min(width,Math.round(n/m*width)));
  return '█'.repeat(k)+'░'.repeat(width-k);
}
function anomalyLabel(z){
  const n=finite(z);
  if(n==null)return 'baseline sammelt';
  if(n>=4)return 'EXTREM HOCH';
  if(n>=2.5)return 'STARK HOCH';
  if(n>=1.5)return 'ERHÖHT';
  if(n<=-2.5)return 'STARK NIEDRIG';
  return 'NORMAL';
}
function netLabel(v){
  const n=finite(v);
  if(n==null)return 'UNKNOWN';
  if(n>0)return 'NET INFLOW';
  if(n<0)return 'NET OUTFLOW';
  return 'BALANCED';
}

export function buildFlowRadar({
  symbol,
  entityFlow=null,
  walletCohort=null,
  onchain=null,
  registryAddressCount=0,
  registryEntityCount=0,
  generatedAt=Date.now()
}={}){
  const lines=[
    'TCX // WHALE + FLOW RADAR · '+String(symbol||'').replace('USDT','/USDT'),
    '━━━━━━━━━━━━━━━━━━━━',
    ''
  ];

  const entityRows=[];
  if(entityFlow?.ok===true){
    for(const [entityId,windows] of Object.entries(entityFlow.entities||{})){
      const m=windows?.['5m']||windows?.['15m'];
      if(!m)continue;
      entityRows.push({entityId,metrics:m});
    }
    entityRows.sort((a,b)=>Number(b.metrics?.grossExternalEth||0)-Number(a.metrics?.grossExternalEth||0));
  }

  lines.push('VERIFIED ENTITY FLOW');
  if(entityRows.length){
    const max=Math.max(1,...entityRows.map(x=>Number(x.metrics?.grossExternalEth||0)));
    for(const row of entityRows.slice(0,6)){
      const m=row.metrics;
      lines.push(
        row.entityId+'  '+bar(m.grossExternalEth,max,8)+'  '+num(m.grossExternalEth,2)+' ETH',
        '  '+netLabel(m.netExternalEth)+' '+signed(m.netExternalEth,2)+' ETH · in '+num(m.inflowEth,2)+' · out '+num(m.outflowEth,2),
        '  Largest '+num(m.largestExternalEth,2)+' ETH · anomaly '+(finite(m.grossExternalRobustZ)==null?'—':signed(m.grossExternalRobustZ,2)+'σ')+' '+anomalyLabel(m.grossExternalRobustZ)
      );
    }
  }else{
    lines.push('Für diesen Coin aktuell kein verifizierter Entity-Flow verfügbar.');
  }

  lines.push(
    '',
    'PUBLIC WALLET COHORTS'
  );
  if(walletCohort?.ok===true){
    const m=walletCohort.metrics||{};
    lines.push(
      'Cohorts '+Number(walletCohort.cohorts||0),
      'Activity 5m '+Number(m.activity5m||0)+' · 15m '+Number(m.activity15m||0),
      'Success 15m '+pct(m.successRate15m,0),
      'Native flow '+signed(m.nativeNetFlow,4)+' · gross '+num(m.nativeGrossFlow,4)
    );
  }else{
    lines.push('Keine konfigurierte öffentliche Wallet-Kohorte für diesen Markt.');
  }

  lines.push('','CHAIN ACTIVITY');
  if(onchain?.ok===true){
    const m=onchain.metrics||{};
    if(onchain.chain==='ETHEREUM'){
      lines.push(
        'Ethereum · Gas '+pct(m.gasUtilization,1)+' · Base fee '+num(m.baseFeeGwei,2)+' gwei',
        '≥100 ETH Transfers letzter Block: '+Number(m.largeNativeTransferCount||0)
      );
    }else if(onchain.chain==='BITCOIN'){
      lines.push(
        'Bitcoin · Mempool '+Number(m.mempoolTxCount||0)+' TX',
        'Fastest fee '+num(m.fastestFeeSatVb,0)+' sat/vB'
      );
    }else if(onchain.chain==='SOLANA'){
      lines.push(
        'Solana · TPS '+num(m.tps,0)+' · non-vote '+num(m.nonVoteTps,0),
        'Priority fee median '+num(m.priorityFeeMedian,0)
      );
    }else{
      lines.push(String(onchain.chain||'Chain')+' live');
    }
  }else{
    lines.push('On-chain Snapshot nicht verfügbar.');
  }

  const top=entityRows[0]?.metrics||null;
  lines.push(
    '',
    'INTERPRETATION',
    top&&finite(top.grossExternalRobustZ)!=null&&top.grossExternalRobustZ>=2.5
      ?'Ungewöhnlich hohe verifizierte Exchange-Flow-Aktivität gegenüber eigener Historie.'
      :'Keine starke verifizierte Entity-Flow-Anomalie bestätigt.',
    top&&finite(top.netExternalEth)!=null
      ?(top.netExternalEth>0?'Netto-Zufluss zur beobachteten Exchange-Adresse.':top.netExternalEth<0?'Netto-Abfluss von der beobachteten Exchange-Adresse.':'Netto-Flow ausgeglichen.')
      :'Flow-Richtung nicht verfügbar.',
    '',
    'Registry coverage: '+Number(registryAddressCount||0)+' verifizierte Adressen · '+Number(registryEntityCount||0)+' Entities.',
    'Das ist KEINE vollständige Exchange-Bilanz und identifiziert keine natürlichen Personen.',
    'Öffentliche/verifizierte On-chain-Evidenz · SHADOW_ONLY'
  );

  return Object.freeze({
    version:FLOW_RADAR_VIEW_VERSION,
    text:lines.join('\n').slice(0,4096),
    entityRows:Object.freeze(entityRows),
    generatedAt:Number(generatedAt),
    researchOnly:true,
    naturalPersonIdentification:false
  });
}
