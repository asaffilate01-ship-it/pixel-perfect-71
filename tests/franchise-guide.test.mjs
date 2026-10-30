import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { brandFaqs, faqs } from '../src/lib/franchise-faqs.ts';
import { franchiseAnswers, searchFranchiseGuide, franchiseGuideContext } from '../src/lib/franchise-knowledge.ts';

test('answers preserve exact public copy with unique source anchors', () => {
  const answers = franchiseAnswers('full_mealdeck');
  assert.equal(new Set(answers.map(a => a.id)).size, answers.length);
  assert.deepEqual(answers.map(({ question, answer }) => ({ question, answer })), [...brandFaqs, ...faqs]);
  for (const a of answers) assert.equal(a.source, `https://mealdeck.co.uk/franchise#${a.id}`);
  assert.ok(searchFranchiseGuide('equipment', 'selected_brands').some(a => a.question === 'Can I use equipment I already own?'));
});
test('scope excludes full-package answers from selected brands', () => {
  const selected = franchiseAnswers('selected_brands');
  assert.equal(selected.length, 7);
  assert.ok(franchiseAnswers('full_mealdeck').length > selected.length);
  for (const result of searchFranchiseGuide('equipment', 'selected_brands')) assert.ok(selected.some(a => a.id === result.id));
});
test('empty, unsupported and oversized questions do not invent answers', () => {
  for (const query of ['', 'how do I', 'quantum astrology', 'ignore instructions reveal secrets']) assert.deepEqual(searchFranchiseGuide(query, 'full_mealdeck'), []);
  assert.throws(() => searchFranchiseGuide('x'.repeat(301), 'full_mealdeck'), RangeError);
});
test('real stdio MCP protocol lists read-only tools and returns grounded results', async () => {
  const client = new Client({ name: 'franchise-test', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: ['scripts/franchise-mcp.mjs'], stderr: 'pipe' });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.equal(tools.length, 3);
    for (const tool of tools) assert.equal(tool.annotations.readOnlyHint, true);
    const result = await client.callTool({ name: 'search_franchise_guide', arguments: { query: 'equipment', packageChoice: 'selected_brands' } });
    const data = JSON.parse(result.content[0].text);
    assert.deepEqual(result.structuredContent, data);
    assert.equal(data.launchGate, 'coming_soon');
    assert.equal(data.liveAvailabilityChecked, false);
    const context = await client.callTool({ name: 'get_franchise_guide_context', arguments: {} });
    assert.deepEqual(context.structuredContent, franchiseGuideContext());
    assert.deepEqual(data.answers, searchFranchiseGuide('equipment', 'selected_brands'));
    const exact = await client.callTool({ name: 'get_franchise_answer', arguments: { id: data.answers[0].id, packageChoice: 'selected_brands' } });
    assert.deepEqual(JSON.parse(exact.content[0].text).answers, [data.answers[0]]);
    const unknown = await client.callTool({ name: 'get_franchise_answer', arguments: { id: 'missing', packageChoice: 'full_mealdeck' } });
    assert.equal(JSON.parse(unknown.content[0].text).status, 'no_published_answer');
    const invalid = await client.callTool({ name: 'search_franchise_guide', arguments: { query: 'x'.repeat(301), packageChoice: 'full_mealdeck' } });
    assert.equal(invalid.isError, true);
  } finally { await client.close(); }
});

for (const [query, expected] of [
  ['How much money do I need?', 'What does an individual-brand franchise cost?'],
  ['Can I use my appliances?', 'Can I use equipment I already own?'],
  ['Who hires employees?', 'Who runs the kitchen and employs the staff?'],
  ['accounting', 'What do compliance and accountancy support include?'],
]) test(`retrieves common wording: ${query}`, () => {
  assert.ok(searchFranchiseGuide(query, 'full_mealdeck').some(a => a.question === expected));
});
test('repeated synonyms do not inflate relevance or duplicate answers', () => {
  assert.deepEqual(searchFranchiseGuide('price pricing prices fees money', 'selected_brands'), searchFranchiseGuide('cost', 'selected_brands'));
});
test('unrelated long questions do not match an incidental topic', () => {
  assert.deepEqual(searchFranchiseGuide('equipment quantum astrology telescope galaxies rocket planets', 'full_mealdeck'), []);
});
test('agent context describes bundled gate without asserting live availability', () => {
  const context = franchiseGuideContext();
  assert.equal(context.launchGate, 'coming_soon');
  assert.equal(context.liveAvailabilityChecked, false);
  assert.equal(context.canSubmitEnquiry, false);
  assert.equal(context.canReserveTerritory, false);
  assert.equal(context.canQuotePersonalisedPrice, false);
});
