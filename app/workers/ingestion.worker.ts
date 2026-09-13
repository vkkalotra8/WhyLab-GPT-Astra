import { analyzeEvidence, combineEvidence, mapMetricCsv, parseCsv } from '../lib/evidence';
self.onmessage = (event: MessageEvent) => {
  try {
    const { action, files } = event.data as { action: string; files: {name:string;text:string;mapping?:Record<string,string>}[] };
    if(action==='preview') {
      const result=files.map(file=>({name:file.name,headers:/\.csv$/i.test(file.name)?parseCsv(file.text.replace(/^\uFEFF/,'')).at(0):[]}));
      self.postMessage({result});
    } else {
      const results=files.map(file=>{try{return analyzeEvidence(file.mapping&&Object.keys(file.mapping).length?mapMetricCsv(file.text,file.mapping):file.text,file.name);}catch(error){throw new Error(file.name+': '+(error instanceof Error?error.message:'Could not parse file.'));}});
      self.postMessage({result:combineEvidence(results)});
    }
  } catch(error) {self.postMessage({error:error instanceof Error?error.message:'Unable to parse evidence.'});}
};
