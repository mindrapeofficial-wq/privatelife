export async function runCentralModel(prompt) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-5.6-sol', store: false, input: String(prompt || '').slice(0, 50000) })
  });
  if (!response.ok) return null;
  const data = await response.json();
  return (data.output || []).flatMap(x => x.content || []).filter(x => x.type === 'output_text').map(x => x.text || '').join('\n').trim() || null;
}
