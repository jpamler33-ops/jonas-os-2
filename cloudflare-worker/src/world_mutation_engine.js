export const WORLD_MUTATION_VERSION="1.0.0";

const DEFAULT_COMPONENTS=[
  "direction","vol","volume","leverage","flow","liq","agreement",
  "premium","basis","depth","optionsSkew","usd","macro"
];

function finite(x){return Number.isFinite(Number(x));}
function mean(xs){
  const v=(xs||[]).map(Number).filter(Number.isFinite);
  return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;
}
function componentMatch(a,b,key){
  const x=a?.[key],y=b?.[key];
  if(x===undefined||x===null||y===undefined||y===null||x==="U"||y==="U")return null;
  return String(x)===String(y);
}
function similarityOnKeys(a,b,keys){
  let matched=0,compared=0;
  for(const key of keys){
    const m=componentMatch(a,b,key);
    if(m===null)continue;
    compared++;
    if(m)matched++;
  }
  return{matched,compared,similarity:compared?matched/compared:null};
}
function firstDivergence(a,b){
  const A=a?.path||[],B=b?.path||[];
  for(let i=0;i<Math.min(A.length,B.length);i++){
    if(String(A[i])!==String(B[i]))return i+1;
  }
  return null;
}
function combinations(items,k,limit=30){
  const out=[];
  const walk=(start,prefix)=>{
    if(out.length>=limit)return;
    if(prefix.length===k){out.push([...prefix]);return;}
    for(let i=start;i<items.length;i++){
      prefix.push(items[i]);walk(i+1,prefix);prefix.pop();
      if(out.length>=limit)return;
    }
  };
  walk(0,[]);
  return out;
}
function analogOutcome(rows){
  const r15=(rows||[]).map(x=>Number(x.ret15)).filter(Number.isFinite);
  const r60=(rows||[]).map(x=>Number(x.ret60)).filter(Number.isFinite);
  const r240=(rows||[]).map(x=>Number(x.ret240)).filter(Number.isFinite);
  return{
    n:(rows||[]).length,
    avgForward15m:mean(r15),
    avgForward60m:mean(r60),
    avgForward240m:mean(r240),
    positive60mRate:r60.length?r60.filter(x=>x>0).length/r60.length:null
  };
}

export function analyzeWorldMutations({
  world,
  currentToken,
  tokenComponents={},
  tokenHistory=[],
  components=DEFAULT_COMPONENTS,
  maxChallengers=4
}={}){
  const paths=[...(world?.paths||[])].sort((a,b)=>Number(b.probability||0)-Number(a.probability||0));
  if(paths.length<2||!currentToken?.components){
    return{
      status:"LEARNING",
      version:WORLD_MUTATION_VERSION,
      originTs:world?.originTs??null,
      challengers:[]
    };
  }

  const dominant=paths[0];
  const challengers=[];

  for(const challenger of paths.slice(1,1+Math.max(1,Number(maxChallengers||4)))){
    const divergenceStep=firstDivergence(dominant,challenger);
    if(!divergenceStep)continue;

    const dominantToken=String(dominant.path?.[divergenceStep-1]||"");
    const challengerToken=String(challenger.path?.[divergenceStep-1]||"");
    const a=tokenComponents[dominantToken]||{};
    const b=tokenComponents[challengerToken]||{};

    const diffs=[];
    for(const key of components){
      const av=a?.[key],bv=b?.[key];
      if(av===undefined||av===null||bv===undefined||bv===null||av==="U"||bv==="U")continue;
      if(String(av)===String(bv))continue;

      const current=currentToken.components?.[key];
      const currentKnown=current!==undefined&&current!==null&&current!=="U";
      diffs.push({
        component:key,
        dominantValue:String(av),
        challengerValue:String(bv),
        currentValue:currentKnown?String(current):null,
        currentMatchesDominant:currentKnown&&String(current)===String(av),
        currentMatchesChallenger:currentKnown&&String(current)===String(bv)
      });
    }
    if(!diffs.length)continue;

    const discriminators=diffs.map(x=>x.component);
    const currentVsA=similarityOnKeys(currentToken.components,a,discriminators);
    const currentVsB=similarityOnKeys(currentToken.components,b,discriminators);

    const challengerMatches=diffs.filter(x=>x.currentMatchesChallenger).length;
    const dominantMatches=diffs.filter(x=>x.currentMatchesDominant).length;
    const known=diffs.filter(x=>x.currentValue!==null).length;
    const neutral=Math.max(0,known-challengerMatches-dominantMatches);
    const readiness=known?challengerMatches/known:null;

    const candidateFlips=diffs.filter(x=>x.currentMatchesDominant);
    let minimumFlipCount=0;
    if(known){
      const needed=Math.max(0,Math.floor((dominantMatches-challengerMatches)/2)+1);
      minimumFlipCount=Math.min(candidateFlips.length,needed);
    }

    const switchSets=minimumFlipCount>0
      ? combinations(candidateFlips,minimumFlipCount,20).map(set=>({
          changes:set.map(x=>({
            component:x.component,
            from:x.dominantValue,
            to:x.challengerValue
          })),
          size:set.length
        }))
      : [];

    // Historical analogs are matched only on the components that separate the
    // two competing worlds. This is a structural analogue, not a causal test.
    const dominantAnalogs=[],challengerAnalogs=[];
    for(const row of tokenHistory||[]){
      if(!row?.components)continue;
      const da=similarityOnKeys(row.components,a,discriminators);
      const db=similarityOnKeys(row.components,b,discriminators);
      if(da.compared<Math.max(2,Math.ceil(discriminators.length*0.6)))continue;
      if(da.similarity>=0.80)dominantAnalogs.push(row);
      if(db.similarity>=0.80)challengerAnalogs.push(row);
    }

    const analogA=analogOutcome(dominantAnalogs);
    const analogB=analogOutcome(challengerAnalogs);
    const outcomeDelta60=
      finite(analogA.avgForward60m)&&finite(analogB.avgForward60m)
        ?Number(analogB.avgForward60m)-Number(analogA.avgForward60m)
        :null;

    const pressure=
      currentVsB.similarity===null||currentVsA.similarity===null
        ?null
        :Math.max(0,Math.min(1,
          0.50*(currentVsB.similarity)+
          0.25*(1-currentVsA.similarity)+
          0.25*Math.min(1,Number(challenger.probability||0)/Math.max(1e-9,Number(dominant.probability||0)))
        ));

    challengers.push({
      challengerWorldRank:challenger.worldRank,
      dominantWorldRank:dominant.worldRank,
      dominantPrior:Number(dominant.probability||0),
      challengerPrior:Number(challenger.probability||0),
      divergenceStep,
      divergenceMinutes:divergenceStep*5,
      dominantToken,
      challengerToken,
      discriminators:diffs,
      currentReadiness:readiness,
      dominantMatches,
      challengerMatches,
      neutralMatches:neutral,
      minimumFlipCount,
      switchSets,
      currentSimilarity:{
        dominant:currentVsA.similarity,
        challenger:currentVsB.similarity
      },
      takeoverPressure:pressure,
      historicalAnalogs:{
        dominant:analogA,
        challenger:analogB,
        deltaAvgForward60m:outcomeDelta60
      },
      status:
        pressure!==null&&pressure>=0.72&&Number(challenger.probability||0)>=0.12
          ?"TAKEOVER_PRESSURE"
          : pressure!==null&&pressure>=0.52
          ?"TIPPING_ZONE"
          :"DOMINANT_STABLE"
    });
  }

  challengers.sort((a,b)=>
    Number(b.takeoverPressure||0)-Number(a.takeoverPressure||0) ||
    Number(b.challengerPrior||0)-Number(a.challengerPrior||0)
  );

  const strongest=challengers[0]||null;
  return{
    status:challengers.length?"ACTIVE":"LEARNING",
    version:WORLD_MUTATION_VERSION,
    originTs:world?.originTs??null,
    currentTokenId:currentToken.tokenId||null,
    dominantWorld:{
      rank:dominant.worldRank,
      probability:Number(dominant.probability||0),
      path:dominant.path
    },
    strongestMutationPressure:strongest,
    challengers,
    note:"Mutation pressure identifies state-component changes that structurally separate competing generated worlds. It is not evidence that changing a component causes a particular market outcome."
  };
}
