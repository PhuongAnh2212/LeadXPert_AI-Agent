const figmaMatch = require('../matching/figmaMatch');

function sectionText(prdText, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^#{2,3}\\s+(?:Feature\\s+\\d+:\\s*)?${escaped}[^\\n]*\\n([\\s\\S]*?)(?=^#{2,3}\\s+|\\Z)`, 'im');
  const match = prdText.match(regex);
  return match ? match[1].trim() : '';
}

function sourceRef(prdText) {
  const explicit = prdText.match(/PRD-[A-Za-z0-9-]+-v\d+(?:\.\d+)?/);
  if (explicit) return explicit[0];
  const version = prdText.match(/version\s*[:#-]?\s*(v?\d+(?:\.\d+)?)/i)?.[1] || 'v1.0';
  return `PRD-NotificationCenter-${version.startsWith('v') ? version : `v${version}`}`;
}

function bulletsFrom(text, fallback) {
  const bullets = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line))
    .map((line) => line.replace(/^[-*]\s+/, '').replace(/^As a .*?,\s*/i, ''));
  return bullets.length ? bullets.slice(0, 5) : fallback;
}

function generateStructuredDoc(prdText, figmaMetadata, rules = [], correctionText = '') {
  const matches = figmaMatch.matchAll(prdText, figmaMetadata);
  const ref = sourceRef(prdText);
  const globalToneRule = rules.find((rule) => rule.type === 'tone_change' && rule.scope?.global);

  return matches.map((match) => {
    const featureBody = sectionText(prdText, match.prdFeature);
    const actions = bulletsFrom(featureBody, [
      `Open ${match.prdFeature} from Notification Center settings.`,
      'Review the available controls and current saved state.',
      'Save the configuration and confirm the success message.'
    ]);
    const screen = match.matched
      ? `${match.artboardName} (${match.artboardId})${match.pendingConfirmation ? ' — pending confirmation' : ''}`
      : 'pending';
    const appliedRules = rules
      .filter((rule) => rule.scope?.global || rule.scope?.feature === match.prdFeature)
      .map((rule) => `Rule applied: ${rule.instruction}`);

    return `## Feature: ${match.prdFeature}
## Overview: ${match.prdFeature} helps users manage notification behavior with a clear, guided experience. This draft reflects ${ref} and ${match.matched ? 'links the workflow to the closest Figma screen.' : 'marks the screen reference as pending until design mapping is confirmed.'}${globalToneRule ? ` Tone guidance: ${globalToneRule.instruction}` : ''}
## Workflow:
1. User opens the Smart Notification Center from app settings or a notification entry point.
2. User reviews the current ${match.prdFeature.toLowerCase()} state and available options.
3. User updates preferences, permissions, or delivery choices described in the PRD.
4. System validates the change and displays a saved confirmation.
5. Notifications follow the updated behavior across supported devices.
## Screens: ${screen}
## User Actions:
${actions.map((action) => `- ${action}`).join('\n')}
## Expected Outcomes:
- The user understands how ${match.prdFeature.toLowerCase()} changes notification delivery.
- Saved settings persist across sessions and are reflected in the notification experience.
- Critical notifications remain visible when the PRD requires priority handling.
${appliedRules.map((rule) => `- ${rule}`).join('\n')}${correctionText ? `\n- Correction incorporated: ${correctionText}` : ''}
## Source: ${ref}`;
  }).join('\n\n');
}

module.exports = { generateStructuredDoc, sourceRef };
