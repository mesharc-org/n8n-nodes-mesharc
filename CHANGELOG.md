# Changelog

## 0.2.0

- **MeshArc Trigger is instant.** Version 2 of the trigger subscribes to the project when the workflow is activated, and MeshArc sends each finished run as it happens, signed with a secret of the subscription's own. Deactivating the workflow removes the subscription. The items are the same as before. It needs an n8n that MeshArc can reach from the internet, and an API key that can write.
- Workflows that use version 1 keep polling, unchanged.

## 0.1.1

No change to the nodes or the credential. The first release published from GitHub Actions through npm
trusted publishing (OIDC), with no access token, and with provenance.

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
