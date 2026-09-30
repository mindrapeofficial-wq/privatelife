import { NextResponse } from 'next/server';
import { isCurrentAdmin } from '../../../../lib/auth.js';

export const runtime = 'nodejs';

function cleanMessage(value) {
  return String(value || '')
    .replace(/sk-[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/gsk_[A-Za-z0-9_-]+/g, '[redacted]')
    .slice(0, 500);
}

function primaryProvider() {
  if (process.env.GROQ_API_KEY) {
    return {
      provider: 'groq',
      key: process.env.GROQ_API_KEY,
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
      url: 'https://api.groq.com/openai/v1/responses'
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      provider: 'openai',
      key: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-5.6-sol',
      url: 'https://api.openai.com/v1/responses'
    };
  }
  return null;
}

export async function GET(request) {
  try {
    const probeToken = process.env.AI_HEALTH_TOKEN || process.env.OPENAI_HEALTH_TOKEN || '';
    const suppliedToken = request.nextUrl.searchParams.get('token') || '';
    const probeAllowed = Boolean(probeToken) && suppliedToken === probeToken;
    if (!probeAllowed && !(await isCurrentAdmin())) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
    }

    const selected = primaryProvider();

    if (!selected) {
      return NextResponse.json({
        ok: false,
        configured: false,
        reachable: false,
        provider: null,
        model: null,
        status: 'missing_key',
        message: 'No hay GROQ_API_KEY ni OPENAI_API_KEY configurada en Render.'
      });
    }

    const startedAt = Date.now();
    const response = await fetch(selected.url, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + selected.key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: selected.model,
        store: false,
        input: 'Return only the word OK.',
        max_output_tokens: 32
      }),
      cache: 'no-store'
    });

    const latencyMs = Date.now() - startedAt;
    let data = {};
    try { data = await response.json(); } catch {}

    if (!response.ok) {
      return NextResponse.json({
        ok: false,
        configured: true,
        reachable: true,
        provider: selected.provider,
        model: selected.model,
        latencyMs,
        httpStatus: response.status,
        status: data?.error?.code || data?.error?.type || selected.provider + '_error',
        message: cleanMessage(data?.error?.message || 'El proveedor de IA rechazó la solicitud.')
      });
    }

    const output = (data.output || [])
      .flatMap(item => item.content || [])
      .filter(item => item.type === 'output_text')
      .map(item => item.text || '')
      .join('\n')
      .trim();

    return NextResponse.json({
      ok: true,
      configured: true,
      reachable: true,
      provider: selected.provider,
      model: selected.model,
      latencyMs,
      status: 'healthy',
      responseId: data.id || null,
      sample: output.slice(0, 40) || 'OK'
    });
  } catch (error) {
    const selected = primaryProvider();
    return NextResponse.json({
      ok: false,
      configured: Boolean(selected),
      reachable: false,
      provider: selected?.provider || null,
      model: selected?.model || null,
      status: 'network_error',
      message: cleanMessage(error?.message || error)
    });
  }
}
