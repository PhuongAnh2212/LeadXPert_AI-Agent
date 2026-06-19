const OpenAI = require('openai');

function createOpenRouterClient() {
  if (!process.env.OPENROUTER_API_KEY) {
    return null;
  }

  return new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: 'https://openrouter.ai/api/v1',
    defaultHeaders: {
      'HTTP-Referer': 'https://local.docs-agent-system.dev',
      'X-Title': 'Two-Agent Documentation System'
    }
  });
}

async function chatCompletion({ system, user, maxTokens = 2000, temperature = 0.2 }) {
  const client = createOpenRouterClient();
  const model = process.env.OPEN_ROUTER_MODEL || 'openai/o4-mini';

  if (!client) {
    return null;
  }

  try {
    const response = await client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    });

    return response.choices?.[0]?.message?.content?.trim() || '';
  } catch (error) {
    if (process.env.OPENROUTER_STRICT === 'true') {
      throw error;
    }
    console.warn(`OpenRouter unavailable, using deterministic local fallback: ${error.message}`);
    return null;
  }
}

module.exports = { chatCompletion };
