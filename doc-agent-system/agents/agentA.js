const { chatCompletion } = require('../utils/openRouterClient');
const promptBuilder = require('../utils/promptBuilder');
const figmaMatch = require('../matching/figmaMatch');
const { loadActiveRules, saveRule } = require('../layers/layer2_feedback');
const { generateStructuredDoc } = require('../layers/layer1_generate');

async function generateDoc(prdText, figmaMetadata) {
  const rules = loadActiveRules();
  const screenMappings = figmaMatch.matchAll(prdText, figmaMetadata);
  const system = promptBuilder.agentASystem(rules);
  const user = `PRD TEXT:\n${prdText}\n\nFIGMA SCREEN MAPPINGS:\n${JSON.stringify(screenMappings, null, 2)}\n\nGenerate the structured documentation now.`;
  const completion = await chatCompletion({ system, user, maxTokens: 2000 });

  return completion || generateStructuredDoc(prdText, figmaMetadata, rules);
}

async function rerunWithCorrection(originalDoc, prdText, correctionText, figmaMetadata) {
  const rules = loadActiveRules();
  const screenMappings = figmaMatch.matchAll(prdText, figmaMetadata);
  const system = promptBuilder.agentASystem(rules);
  const user = `ORIGINAL DOC:\n${originalDoc}\n\nPRD TEXT:\n${prdText}\n\nFIGMA SCREEN MAPPINGS:\n${JSON.stringify(screenMappings, null, 2)}\n\nPM CORRECTION:\n${correctionText}\n\nRevise the documentation while preserving the required output format.`;
  const completion = await chatCompletion({ system, user, maxTokens: 2000 });
  const newRule = saveRule(correctionText, inferFeature(correctionText, originalDoc), 'generated_doc', 'PM-Sarah');

  return completion || `${generateStructuredDoc(prdText, figmaMetadata, [...rules, newRule], correctionText)}\n`;
}

function inferFeature(correctionText, originalDoc) {
  const lower = correctionText.toLowerCase();
  const features = [...originalDoc.matchAll(/^## Feature:\s*(.+)$/gm)].map((match) => match[1].trim());
  return features.find((feature) => lower.includes(feature.toLowerCase())) || features[0] || 'General';
}

module.exports = { generateDoc, rerunWithCorrection };
