const fs = require('fs');
const path = require('path');

function clean(value = '') {
  return value.replace(/\*\*/g, '').trim();
}

function parseTable(block) {
  const rows = block.split('\n').filter((line) => /^\s*\|/.test(line));
  if (rows.length < 2) return [];
  const cells = (line) => line.split('|').slice(1, -1).map(clean);
  const headers = cells(rows[0]);
  return rows.slice(2).map(cells).filter((row) => row.length).map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] || '']))
  );
}

function parseSections(markdown) {
  const matches = [...markdown.matchAll(/^(#{1,6})\s+(.+)$/gm)];
  return matches.map((match, index) => {
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? markdown.length;
    return {
      level: match[1].length,
      title: clean(match[2]),
      content: markdown.slice(start, end).trim()
    };
  });
}

function rowsFromSection(section) {
  return section ? parseTable(section.content) : [];
}

function bullets(section) {
  if (!section) return [];
  return section.content.split('\n').map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line))
    .map((line) => clean(line.replace(/^[-*]\s+/, '')));
}

function parsePrd(markdown, sourceFile = 'input.md') {
  if (!/^#\s+/m.test(markdown)) throw new Error('PRD must contain a markdown title');
  const sections = parseSections(markdown);
  const find = (pattern) => sections.find((section) => pattern.test(section.title));
  const summary = rowsFromSection(find(/Functional Requirements Summary/i));
  const criteria = rowsFromSection(find(/Key Acceptance Criteria/i));
  const nfrSections = sections.filter((section) => section.level === 3 && /Performance|Security|Stability|Reliability|Compliance/i.test(section.title));
  const requirements = summary.map((row) => ({
    id: row.ID, text: row.Requirement, priority: row.Priority,
    acceptanceCriteria: (row['Acceptance Criteria'] || '').split(',').map(clean).filter(Boolean)
  }));
  const acceptanceCriteria = criteria.map((row) => ({
    id: row.ID, requirementId: row.FR, scenario: row.Scenario, expectedOutcome: row['Expected Outcome']
  }));
  const title = clean(markdown.match(/^#\s+(.+)$/m)?.[1] || path.basename(sourceFile));
  const metadataRows = parseTable(markdown.slice(0, markdown.indexOf('## ')));

  return {
    sourceFile: path.resolve(sourceFile), title,
    metadata: metadataRows.length ? Object.fromEntries(metadataRows.map((row) => [row.Field, row.Value])) : {},
    sections, requirements, acceptanceCriteria,
    priorities: Object.groupBy ? Object.groupBy(requirements, (item) => item.priority) : requirements.reduce((acc, item) => { (acc[item.priority] ||= []).push(item); return acc; }, {}),
    assumptions: (() => { const section = find(/^Assumptions$/i); const rows = rowsFromSection(section); return rows.length ? rows : bullets(section); })(),
    dependencies: (() => { const section = find(/^Dependencies$/i); const rows = rowsFromSection(section); return rows.length ? rows : bullets(section); })(),
    openQuestions: rowsFromSection(find(/Open Questions/i)),
    appendix: sections.filter((section) => /^Appendix/i.test(section.title)),
    outOfScope: bullets(find(/Out of Scope/i)),
    nonFunctionalRequirements: nfrSections.flatMap(rowsFromSection)
  };
}

function ingestPrd(filePath, outputPath) {
  if (!/\.md|\.markdown$/i.test(filePath)) throw new Error('Only markdown PRD files are supported');
  const parsed = parsePrd(fs.readFileSync(filePath, 'utf8'), filePath);
  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(parsed, null, 2)}\n`);
  }
  return parsed;
}

module.exports = { parsePrd, ingestPrd, parseSections, parseTable };
