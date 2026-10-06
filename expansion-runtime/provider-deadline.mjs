// Abort is cooperative. The race also bounds providers/body readers that ignore it.
export async function providerDeadline(work,ms,label,onTimeout=()=>{}){
  let timer;
  try{
    return await Promise.race([
      Promise.resolve().then(work),
      new Promise((_,reject)=>{timer=setTimeout(()=>{
        reject(new Error(label+'_TIMEOUT'));
        onTimeout();
      },ms);})
    ]);
  }finally{clearTimeout(timer);}
}
