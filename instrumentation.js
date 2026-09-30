export async function register() {
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (!process.env.OPENAI_HEALTH_TOKEN) return;

  const model = process.env.OPENAI_MODEL || 'gpt-5.6-sol';
  const key = process.env.OPENAI_API_KEY;

  if (!key) {
    console.log('OPENAI_PROBE', JSON.stringify({ ok:false, configured:false, model, status:'missing_key' }));
    return;
  }

  try {
    const startedAt = Date.now();
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        store: false,
        input: 'Return only the word OK.',
        max_output_tokens: 16
      })
    });

    let data = {};
    try { data = await response.json(); } catch {}

    if (!response.ok) {
      console.log('OPENAI_PROBE', JSON.stringify({
        ok:false,
        configured:true,
        reachable:true,
        model,
        latencyMs:Date.now()-startedAt,
        httpStatus:response.status,
        status:data?.error?.code || data?.error?.type || 'openai_error',
        message:String(data?.error?.message || 'OpenAI rejected request').replace(/sk-[A-Za-z0-9_-]+/g,'[redacted]').slice(0,300)
      }));
      return;
    }

    console.log('OPENAI_PROBE', JSON.stringify({
      ok:true,
      configured:true,
      reachable:true,
      model,
      latencyMs:Date.now()-startedAt,
      responseId:data?.id || null,
      status:'healthy'
    }));
  } catch (error) {
    console.log('OPENAI_PROBE', JSON.stringify({
      ok:false,
      configured:true,
      reachable:false,
      model,
      status:'network_error',
      message:String(error?.message || error).slice(0,300)
    }));
  }
}
