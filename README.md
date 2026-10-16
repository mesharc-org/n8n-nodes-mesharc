# n8n-nodes-mesharc

[n8n](https://n8n.io) nodes for [MeshArc](https://mesharc.dev), the web crawler that turns sites into clean markdown and records what changed between crawls.

- **MeshArc**: scrape a page, crawl or map a site, search the web, and read what changed on a watched site.
- **MeshArc Trigger**: start a workflow when a MeshArc project's run finds pages added, changed or removed.

Both can also be used as tools by n8n's AI Agent.

[Installation](#installation) · [Credentials](#credentials) · [Operations](#operations) · [Trigger](#trigger) · [Compatibility](#compatibility) · [Resources](#resources)

## Installation

In n8n, go to **Settings → Community Nodes → Install**, enter `n8n-nodes-mesharc`, and confirm. See n8n's [community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) for details.

## Credentials

You need a MeshArc API key.

1. Sign in at [mesharc.dev](https://mesharc.dev). The free plan includes 1,000 credits with no card.
2. Go to **Settings → API keys** and create a key. Scraping, crawling, mapping and searching need a key that can **write**. A read-only key can only use **Get Changes** and the trigger.
3. In n8n, create a **MeshArc API** credential and paste the key. n8n tests it straight away.

## Operations

| Resource | Operation | What it does | Output |
|---|---|---|---|
| Page | **Scrape** | Reads one page as clean markdown, past bot walls when needed | One item: URL, title, markdown, HTTP status, page status, words, credits |
| Site | **Crawl** | Reads a site or a section of it. Set **Max Pages**, and optionally **Max Depth** and **Include** / **Exclude Paths** (globs such as `/blog/*`) | With **Wait for Completion** on (the default), one item per page. Off, one item with the crawl's ID |
| Site | **Get Crawl** | Gets a crawl's pages by its ID | One item per page |
| Site | **Map** | Lists the URLs a site declares in its sitemaps, without fetching them. Optional **Search** and **Limit** | One item per URL, with `lastmod` and `section` |
| Web | **Search** | Searches the web, up to 10 results. With **Read Pages**, it also reads each result's page | One item per result: position, title, URL, snippet, and the page when read |
| Project | **Get Changes** | Lists what a MeshArc project's latest run (or a given run) added, changed or removed | One item per changed page: kind, URL, title, words added and removed, run and time |

For Scrape, Crawl and Get Crawl, turn **Simplify** off to get MeshArc's full response instead of the main fields.

## Trigger

**MeshArc Trigger → Page Changed** starts the workflow when a run of a MeshArc project finds changed pages.

1. In MeshArc, create a project for the site you want to watch, and give it a schedule (hourly, daily, weekly). MeshArc crawls on that schedule and records what changed.
2. In n8n, add **MeshArc Trigger**. Pick the **Project**, choose which **Changes** start the workflow (Added, Modified, Removed, Fields Changed), and set how often n8n checks.

**How it behaves:**
- **Each changed page is one item:** kind, URL, title, words added and removed, word counts, project, run, and time.
- **Activating it reports nothing old.** It only remembers where the project is.
- **Every run after that is reported once,** even when several runs finish between two checks.
- **Nothing is lost when a check fails.** It tries again at the next check.
- **Fetch Test Event** shows the latest real changes without affecting what the trigger reports later.

## Cost

Requests are billed in MeshArc credits, the same as any other API call:
- a plain page read is 1 credit;
- blocked pages and 404s cost nothing;
- a sitemap read is 1 credit per sitemap file;
- a web search costs what its results page costs.

**Get Changes** and the trigger only read what MeshArc already stored, so they cost nothing. See [pricing](https://mesharc.dev/pricing).

## Compatibility

Tested with n8n 2.43 on Node.js 24.

## Resources

- [MeshArc docs](https://mesharc.dev/docs) and [API reference](https://mesharc.dev/docs/api)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [Questions](https://github.com/orgs/mesharc-org/discussions) · security reports to security@mesharc.dev

## License

MIT
