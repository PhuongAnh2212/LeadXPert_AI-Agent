const fs = require('fs');
const path = require('path');

const rulesPath = path.join(__dirname, '..', 'store', 'rules.json');
const priorityRank = { high: 0, normal: 1, low: 2 };

function readRules() {
  return JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
}

function writeRules(rules) {
  fs.writeFileSync(rulesPath, `${JSON.stringify(rules, null, 2)}\n`);
}

function inferType(correction) {
  const text = correction.toLowerCase();
  if (text.includes('tone') || text.includes('voice')) return 'tone_change';
  if (text.includes('add')) return 'add_section';
  if (text.includes('remove') || text.includes('delete')) return 'remove_section';
  if (text.includes('rewrite') || text.includes('change')) return 'rewrite';
  if (text.includes('reference') || text.includes('figma') || text.includes('confirm') || text.includes('remap')) return 'add_reference';
  return 'rewrite';
}

function nextRuleId(rules) {
  const highest = rules.reduce((max, rule) => {
    const number = Number(String(rule.rule_id || '').replace('rule_', ''));
    return Number.isFinite(number) ? Math.max(max, number) : max;
  }, 0);
  return `rule_${String(highest + 1).padStart(3, '0')}`;
}

function saveRule(correction, feature = 'General', section = 'general', authorSlackId = 'PM-Sarah') {
  const rules = readRules();
  const rule = {
    rule_id: nextRuleId(rules),
    created_at: new Date().toISOString(),
    author: authorSlackId || 'PM-Sarah',
    author_role: 'pm',
    scope: {
      feature,
      section,
      global: /global|all docs|every feature/i.test(correction)
    },
    type: inferType(correction),
    instruction: correction.trim(),
    priority: /urgent|must|critical|always/i.test(correction) ? 'high' : 'normal',
    status: 'active',
    supersedes: null,
    source: `slack_thread_${authorSlackId || 'local'}`,
    confidence: 1.0
  };

  rules.push(rule);
  writeRules(rules);
  return rule;
}

function loadActiveRules() {
  return readRules()
    .filter((rule) => rule.status === 'active')
    .sort((left, right) => {
      const priorityDiff = (priorityRank[left.priority] ?? 1) - (priorityRank[right.priority] ?? 1);
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(left.created_at) - new Date(right.created_at);
    });
}

module.exports = { saveRule, loadActiveRules, inferType };
