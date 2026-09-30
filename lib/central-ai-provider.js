export async function runCentralModel(prompt, instructions='') {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-5.6-sol',
      store: false,
      instructions: String(instructions || '').slice(0, 16000),
      input: String(prompt || '').slice(0, 90000),
      text: { format: { type: 'json_object' } },
      max_output_tokens: 6000
    })
  });
  if (!response.ok) return null;
  const data = await response.json();
  return (data.output || []).flatMap(x => x.content || []).filter(x => x.type === 'output_text').map(x => x.text || '').join('\n').trim() || null;
}
