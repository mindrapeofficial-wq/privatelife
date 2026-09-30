export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { startLifeEngineLoop } = await import('./instrumentation-node.js');
  await startLifeEngineLoop();
  if (!process.env.AI_HEALTH_TOKEN && !process.env.OPENAI_HEALTH_TOKEN) return;

  const selected = process.env.GROQ_API_KEY
    ? {
        provider: 'groq',
        key: process.env.GROQ_API_KEY,
        model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
        url: 'https://api.groq.com/openai/v1/responses',
        supportsStore: false,
      }
    : process.env.OPENAI_API_KEY
      ? {
          provider: 'openai',
          key: process.env.OPENAI_API_KEY,
          model: process.env.OPENAI_MODEL || 'gpt-5.6-sol',
          url: 'https://api.openai.com/v1/responses',
          supportsStore: true,
        }
      : null;

  if (!selected) {
    console.log('AI_PROBE', JSON.stringify({
      ok:false,
      configured:false,
      provider:null,
      model:null,
      status:'missing_key'
    }));
    return;
  }

  try {
    const startedAt = Date.now();
    const payload = {
      model: selected.model,
      input: 'Return only the word OK.',
      max_output_tokens: 16
    };
    if (selected.supportsStore) payload.store = false;

    const response = await fetch(selected.url, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + selected.key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    let data = {};
    try { data = await response.json(); } catch {}

    if (!response.ok) {
      console.log('AI_PROBE', JSON.stringify({
        ok:false,
        configured:true,
        reachable:true,
        provider:selected.provider,
        model:selected.model,
        latencyMs:Date.now()-startedAt,
        httpStatus:response.status,
        status:data?.error?.code || data?.error?.type || selected.provider + '_error',
        message:String(data?.error?.message || 'Provider rejected request')
          .replace(/sk-[A-Za-z0-9_-]+/g,'[redacted]')
          .replace(/gsk_[A-Za-z0-9_-]+/g,'[redacted]')
          .slice(0,300)
      }));
      return;
    }

    console.log('AI_PROBE', JSON.stringify({
      ok:true,
      configured:true,
      reachable:true,
      provider:selected.provider,
      model:selected.model,
      latencyMs:Date.now()-startedAt,
      responseId:data?.id || null,
      status:'healthy'
    }));
  } catch (error) {
    console.log('AI_PROBE', JSON.stringify({
      ok:false,
      configured:true,
      reachable:false,
      provider:selected.provider,
      model:selected.model,
      status:'network_error',
      message:String(error?.message || error).slice(0,300)
    }));
  }
}
