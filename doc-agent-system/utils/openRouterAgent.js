require('dotenv').config();

function configured() { return Boolean(process.env.OPENROUTER_API_KEY); }

async function sdk() {
  const [{ OpenRouter, tool, stepCountIs }, { z }] = await Promise.all([import('@openrouter/agent'), import('zod')]);
  return { OpenRouter, tool, stepCountIs, z };
}

function stripFences(text) { return String(text || '').trim().replace(/^```(?:json|markdown|md)?\s*/i, '').replace(/\s*```$/, '').trim(); }

async function runAgent({ instructions, input, tools = [], context, maxOutputTokens = 5000, temperature = 0.1, sessionId }) {
  if (!configured()) return null;
  const { OpenRouter, stepCountIs } = await sdk();
  const client = new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
  const result = client.callModel({
    model: process.env.OPENROUTER_MODEL || 'openai/gpt-5-nano',
    instructions,
    input,
    tools,
    context,
    temperature,
    maxOutputTokens,
    stopWhen: stepCountIs(6),
    allowFinalResponse: 'Return the final answer now in the requested format.',
    sessionId
  });
  return stripFences(await result.getText());
}

async function sourceBundleTool(bundle, onRead = () => {}) {
  const { tool, z } = await sdk();
  return tool({
    name: 'get_source_bundle',
    description: 'Load the parsed PRD, design inputs, accepted feedback, and learned documentation preferences. Call this before writing documentation.',
    inputSchema: z.object({ reason: z.string().describe('Why the source bundle is needed') }),
    outputSchema: z.any(),
    execute: async () => { onRead(); return bundle; }
  });
}

async function knowledgeSearchTool(search) {
  const { tool, z } = await sdk();
  return tool({
    name: 'search_knowledge_base',
    description: 'Search indexed PRD, documentation, and feedback notes. Use it before answering and cite only returned source identifiers.',
    inputSchema: z.object({ query: z.string(), limit: z.number().int().min(1).max(10).default(6) }),
    outputSchema: z.object({ results: z.array(z.object({ source: z.string(), content: z.string(), score: z.number() })) }),
    execute: async ({ query, limit }) => ({ results: search(query, limit) })
  });
}

module.exports = { configured, runAgent, sourceBundleTool, knowledgeSearchTool, stripFences };
