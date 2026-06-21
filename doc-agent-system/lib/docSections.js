function splitDocument(markdown) {
  const matches = [...markdown.matchAll(/^##\s+(.+)$/gm)];
  const preamble = markdown.slice(0, matches[0]?.index ?? markdown.length);
  const sections = matches.map((match, index) => ({ heading: match[1].trim(), raw: markdown.slice(match.index, matches[index + 1]?.index ?? markdown.length) }));
  return { preamble, sections };
}

function sectionMap(markdown) { return new Map(splitDocument(markdown).sections.map((section) => [section.heading, section.raw])); }

function replaceSections(markdown, replacements) {
  const parsed = splitDocument(markdown);
  return parsed.preamble + parsed.sections.map((section) => replacements.get(section.heading) || section.raw).join('');
}

module.exports = { splitDocument, sectionMap, replaceSections };
