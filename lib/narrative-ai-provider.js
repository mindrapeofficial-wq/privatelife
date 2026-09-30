function extractOutput(data={}){return(data.output||[]).flatMap(item=>item.content||[]).filter(item=>item.type==='output_text').map(item=>item.text||'').join('\n').trim()||null}

async function callResponses({url,key,model,prompt,instructions,supportsStore=false}){
 if(!key)return null;
 try{
  const payload={
   model,
   instructions:String(instructions||'').slice(0,24000),
   input:String(prompt||'').slice(0,120000),
   text:{format:{type:'json_object'}},
   max_output_tokens:12000
  };
  if(supportsStore)payload.store=false;
  const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});
  if(!response.ok){console.error('narrative_provider_http_error',response.status,model);return null}
  return extractOutput(await response.json());
 }catch(error){console.error('narrative_provider_failed',model,error?.message||error);return null}
}

export async function runNarratorModel(prompt,instructions=''){
 const preferred=String(process.env.NARRATOR_PROVIDER||'openai').toLowerCase();
 const openai=()=>callResponses({url:'https://api.openai.com/v1/responses',key:process.env.OPENAI_API_KEY,model:process.env.NARRATOR_MODEL||process.env.OPENAI_MODEL||'gpt-5.6-sol',prompt,instructions,supportsStore:true});
 const groq=()=>callResponses({url:'https://api.groq.com/openai/v1/responses',key:process.env.GROQ_API_KEY,model:process.env.GROQ_NARRATOR_MODEL||process.env.GROQ_MODEL||'openai/gpt-oss-120b',prompt,instructions});
 if(preferred==='groq')return(await groq())||(await openai());
 return(await openai())||(await groq());
}
