function normalizeTokens(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((token) => token && !['and', 'the', 'with', 'for', 'v1', 'v2'].includes(token));
}

function jaccardSimilarity(left, right) {
  const leftSet = new Set(normalizeTokens(left));
  const rightSet = new Set(normalizeTokens(right));
  if (leftSet.size === 0 || rightSet.size === 0) return 0;

  const intersection = [...leftSet].filter((token) => rightSet.has(token)).length;
  const union = new Set([...leftSet, ...rightSet]).size;
  return Number((intersection / union).toFixed(2));
}

function extractFeatureSections(prdText) {
  const headingRegex = /^#{2,3}\s+(?:Feature\s+\d+:\s*)?(.+)$/gm;
  const features = [];
  let match;

  while ((match = headingRegex.exec(prdText)) !== null) {
    const heading = match[1].trim();
    if (/^(overview|goals|non-goals|release|metrics|risks|appendix|user stories|acceptance criteria)$/i.test(heading)) {
      continue;
    }
    features.push(heading.replace(/\s+v\d+(\.\d+)?$/i, ''));
  }

  return [...new Set(features)].slice(0, 12);
}

function exactMatch(feature, artboard) {
  const featureText = feature.toLowerCase();
  const artboardName = String(artboard.artboard_name || '').toLowerCase();
  const ticketRef = String(artboard.ticket_ref || '').toLowerCase();
  const compactFeature = featureText.replace(/[^a-z0-9]/g, '');
  const compactArtboard = artboardName.replace(/[^a-z0-9]/g, '');

  return artboardName.includes(featureText) ||
    featureText.includes(artboardName.replace(/\s+-\s+\d+$/, '')) ||
    compactArtboard.includes(compactFeature) ||
    ticketRef.includes(compactFeature);
}

function applyTier(feature, bestMatch, method, confidence) {
  if (!bestMatch || confidence < 0.6) {
    return {
      prdFeature: feature,
      artboardId: null,
      artboardName: 'pending',
      confidence,
      method,
      pendingConfirmation: false,
      matched: false,
      reference: 'pending'
    };
  }

  return {
    prdFeature: feature,
    artboardId: bestMatch.artboard_id,
    artboardName: bestMatch.artboard_name,
    confidence,
    method,
    pendingConfirmation: confidence >= 0.6 && confidence < 0.85,
    matched: true,
    inferred: method === 'semantic',
    reference: `${bestMatch.artboard_name} (${bestMatch.artboard_id})`
  };
}

function matchAll(prdText, figmaMetadata) {
  const features = extractFeatureSections(prdText);

  return features.map((feature) => {
    const exact = figmaMetadata.find((artboard) => exactMatch(feature, artboard));
    if (exact) {
      return applyTier(feature, exact, 'exact', 1.0);
    }

    const scored = figmaMetadata
      .map((artboard) => ({
        artboard,
        score: jaccardSimilarity(feature, `${artboard.artboard_name} ${artboard.description} ${artboard.ticket_ref}`)
      }))
      .sort((left, right) => right.score - left.score)[0];

    return applyTier(feature, scored?.artboard, 'semantic', scored?.score || 0);
  });
}

module.exports = { matchAll, extractFeatureSections, jaccardSimilarity };
