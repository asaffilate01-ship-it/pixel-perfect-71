import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { brandFaqs, faqs } from '../src/lib/franchise-faqs.ts';
import { franchiseAnswers, searchFranchiseGuide } from '../src/lib/franchise-knowledge.ts';

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
    assert.equal(tools.length, 2);
    for (const tool of tools) assert.equal(tool.annotations.readOnlyHint, true);
    const result = await client.callTool({ name: 'search_franchise_guide', arguments: { query: 'equipment', packageChoice: 'selected_brands' } });
    const data = JSON.parse(result.content[0].text);
    assert.deepEqual(data.answers, searchFranchiseGuide('equipment', 'selected_brands'));
    const exact = await client.callTool({ name: 'get_franchise_answer', arguments: { id: data.answers[0].id, packageChoice: 'selected_brands' } });
    assert.deepEqual(JSON.parse(exact.content[0].text).answers, [data.answers[0]]);
    const unknown = await client.callTool({ name: 'get_franchise_answer', arguments: { id: 'missing', packageChoice: 'full_mealdeck' } });
    assert.equal(JSON.parse(unknown.content[0].text).status, 'no_published_answer');
    const invalid = await client.callTool({ name: 'search_franchise_guide', arguments: { query: 'x'.repeat(301), packageChoice: 'full_mealdeck' } });
    assert.equal(invalid.isError, true);
  } finally { await client.close(); }
});
