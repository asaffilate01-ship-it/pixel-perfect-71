import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { franchiseAnswers, searchFranchiseGuide } from '../src/lib/franchise-knowledge.ts';

const server = new McpServer({ name: 'mealdeck-franchise-guide', version: '1.0.0' });
const packageChoice = z.enum(['full_mealdeck', 'selected_brands']);
const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const reply = (answers) => ({ content: [{ type: 'text', text: JSON.stringify({
  status: answers.length ? 'published_answers' : 'no_published_answer',
  answers,
  guidance: 'Exact public FAQ excerpts, not personalised advice or confirmation of price, territory availability or launch. Use an enquiry for unpublished answers.',
  enquiryUrl: 'https://mealdeck.co.uk/franchise#apply',
}) }] });
server.registerTool('search_franchise_guide', {
  description: 'Find related MealDeck public franchise FAQs. Returns exact excerpts and sources; cannot quote personalised fees, reserve territory or submit enquiries.',
  inputSchema: { query: z.string().min(1).max(300), packageChoice }, annotations,
}, ({ query, packageChoice }) => reply(searchFranchiseGuide(query, packageChoice)));
server.registerTool('get_franchise_answer', {
  description: 'Read an exact public FAQ using an ID returned by search_franchise_guide.',
  inputSchema: { id: z.string().min(1).max(200), packageChoice }, annotations,
}, ({ id, packageChoice }) => reply(franchiseAnswers(packageChoice).filter((answer) => answer.id === id)));
await server.connect(new StdioServerTransport());
