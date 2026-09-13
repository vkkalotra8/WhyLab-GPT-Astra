export type InputFile={name:string;text:string;mapping?:Record<string,string>};
export function runIngestion<T>(action:'preview'|'analyze',files:InputFile[],signal?:AbortSignal):Promise<T> {
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(new Error('Parsing cancelled.'));return;}
    const worker=new Worker(new URL('../workers/ingestion.worker.ts',import.meta.url),{type:'module'});
    const cleanup=()=>{worker.terminate();signal?.removeEventListener('abort',abort);};
    const abort=()=>{cleanup();reject(new Error('Parsing cancelled.'));};
    signal?.addEventListener('abort',abort,{once:true});
    worker.onmessage=event=>{cleanup();if(event.data.error)reject(new Error(event.data.error));else resolve(event.data.result as T);};
    worker.onerror=()=>{cleanup();reject(new Error('Background parsing failed. Try a smaller file or reload the page.'));};
    worker.postMessage({action,files});
  });
}
