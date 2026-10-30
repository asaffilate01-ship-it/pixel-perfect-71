# Public franchise guide and MCP

The franchise page now searches the existing approved public FAQs. Results are exact excerpts with links to their FAQ anchors. Selected-brand mode excludes full-package-only FAQs. No generated answers, live quotes, territory checks, reservations or enquiry writes are performed. The existing launch gates still apply.

## Run the local MCP server

Requires Node 24 and dependencies installed with `bun install --frozen-lockfile` (including development dependencies).

Run `npm run mcp:franchise`, or configure a stdio-compatible MCP client using an absolute repository path:

```json
{
  "mcpServers": {
    "mealdeck-franchise-guide": {
      "command": "node",
      "args": ["/absolute/path/to/mealdeck/scripts/franchise-mcp.mjs"]
    }
  }
}
```

Tools:

- `get_franchise_guide_context`: no arguments; returns the bundled launch gate and capability limits, explicitly without a live availability check.

- `search_franchise_guide`: `query` (1–300 characters) and required `packageChoice` (`full_mealdeck` or `selected_brands`). Returns up to three related public answers.
- `get_franchise_answer`: `id` returned by search and the same `packageChoice`. Unknown or excluded IDs return `no_published_answer`.

All three tools are read-only, deterministic and use bundled public copy. They need no API credentials or network access. Search relevance uses explicit synonym groups for costs, staffing, equipment and other common topics, with an overlap threshold; related results are not a determination that a question has been fully answered. Unpublished or personalised questions should go to the enquiry flow. A client must be configured separately; this change does not connect or deploy an Omniqora agent.

Update `src/lib/franchise-faqs.ts` when approved public copy changes. The website and MCP use that same source. Restart the MCP process after updating the checkout; its answers reflect the installed revision.

## Validation

Responses include identical JSON text and structured content. Search status is `related_published_answers` or `no_published_answer`. Each answer response includes the guide context so agents see launch restrictions without a separate call.

The UI offers a clear-search button that restores focus, and source links expand the referenced FAQ.

`npm run test:franchise-guide` checks scope, unknown questions, bounds, source anchors and a real SDK client/server stdio exchange. Production build, TypeScript and the existing 255 regression tests pass locally. Browser checks are defined for mobile and desktop but execution remains blocked in this environment by socket restrictions; visual/interactive browser validation is still required before merge.
