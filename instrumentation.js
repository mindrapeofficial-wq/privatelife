async function startLifeEngineLoop() {
  if (globalThis.__privateLifeBackgroundScheduler) return;
  globalThis.__privateLifeBackgroundScheduler = true;

  async function run() {
    try {
      const [{ ensureSchema, query }, { scheduleLifeEngine }] = await Promise.all([
        import('./lib/db.js'),
        import('./lib/life-scheduler.js')
      ]);
      await ensureSchema();
      const users = await query(`
        SELECT u.id, COALESCE(w.timezone,'UTC') AS timezone
        FROM private_life.users u
        LEFT JOIN private_life.world_clock w ON w.user_id=u.id
        ORDER BY u.id ASC
        LIMIT 500
      `);
      for (const user of users.rows) {
        try {
          await scheduleLifeEngine(user.id, user.timezone || 'UTC');
        } catch (error) {
          console.error('life_background_player_failed', user.id, String(error?.message || error).slice(0,200));
        }
      }
    } catch (error) {
      console.error('life_background_tick_failed', String(error?.message || error).slice(0,300));
    }
  }

  const initial = setTimeout(run, 12000);
  initial.unref?.();
  const timer = setInterval(run, 60000);
  timer.unref?.();
}

export async function register() {
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== 'nodejs') return;
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
