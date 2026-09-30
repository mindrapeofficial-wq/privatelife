import { NextResponse } from 'next/server';
import { isCurrentAdmin } from '../../../../lib/auth.js';

export const runtime = 'nodejs';

function cleanMessage(value) {
  return String(value || '').replace(/sk-[A-Za-z0-9_-]+/g, '[redacted]').slice(0, 500);
}

export async function GET() {
  try {
    if (!(await isCurrentAdmin())) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
    }

    const key = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || 'gpt-5.6-sol';

    if (!key) {
      return NextResponse.json({
        ok: false,
        configured: false,
        reachable: false,
        model,
        status: 'missing_key',
        message: 'OPENAI_API_KEY no está definida en el entorno de Render.'
      });
    }

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
        model,
        latencyMs,
        httpStatus: response.status,
        status: data?.error?.code || data?.error?.type || 'openai_error',
        message: cleanMessage(data?.error?.message || 'OpenAI rechazó la solicitud.')
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
      model,
      latencyMs,
      status: 'healthy',
      responseId: data.id || null,
      sample: output.slice(0, 40) || 'OK'
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      configured: Boolean(process.env.OPENAI_API_KEY),
      reachable: false,
      model: process.env.OPENAI_MODEL || 'gpt-5.6-sol',
      status: 'network_error',
      message: cleanMessage(error?.message || error)
    });
  }
}
