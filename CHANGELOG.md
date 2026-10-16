# Changelog

## 0.1.0

The first release.

- **MeshArc** node:
  - Page: Scrape.
  - Site: Crawl, with waiting for completion or not; Get Crawl; Map.
  - Web: Search, optionally reading each result's page.
  - Project: Get Changes.
  - Usable as a tool by n8n's AI Agent.
- **MeshArc Trigger**, Page Changed: polls a MeshArc project and starts the workflow once for each changed page of every new run. It reports nothing old on activation, and loses nothing when a check fails.
- **MeshArc API** credential: an API key, tested against the API when saved.
