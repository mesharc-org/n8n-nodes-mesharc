import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import {
	changeItem,
	mesharcRequest,
	searchProjects,
	simplifyPage,
	waitForJob,
} from './GenericFunctions';

const show = (...operation: string[]) => ({ displayOptions: { show: { operation } } });

/** "a, b , c" as ["a", "b", "c"]; empty as undefined. */
function list(value: string): string[] | undefined {
	const parts = value
		.split(',')
		.map((part) => part.trim())
		.filter(Boolean);
	return parts.length ? parts : undefined;
}

export class MeshArc implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'MeshArc',
		name: 'meshArc',
		icon: { light: 'file:../../icons/mesharc.svg', dark: 'file:../../icons/mesharc.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Scrape, crawl, map and search the web as clean markdown, and read what changed on a watched site',
		defaults: { name: 'MeshArc' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'mesharcApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				default: 'page',
				options: [
					{ name: 'Page', value: 'page' },
					{ name: 'Project', value: 'project' },
					{ name: 'Site', value: 'site' },
					{ name: 'Web', value: 'web' },
				],
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['page'] } },
				default: 'scrape',
				options: [
					{ name: 'Scrape', value: 'scrape', action: 'Scrape a page', description: 'Read one page as clean markdown' },
				],
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['site'] } },
				default: 'crawl',
				options: [
					{ name: 'Crawl', value: 'crawl', action: 'Crawl a site', description: 'Read a site or a section of it, page by page' },
					{ name: 'Get Crawl', value: 'getCrawl', action: 'Get a crawl', description: "Get a crawl's pages by its ID" },
					{ name: 'Map', value: 'map', action: 'Map a site', description: 'List the URLs a site declares in its sitemaps, without fetching them' },
				],
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['web'] } },
				default: 'search',
				options: [
					{ name: 'Search', value: 'search', action: 'Search the web', description: 'Search the web, and optionally read each result page' },
				],
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['project'] } },
				default: 'getChanges',
				options: [
					{ name: 'Get Changes', value: 'getChanges', action: 'Get what changed on a watched site', description: "List the pages a project's run added, changed or removed" },
				],
			},

			// Scrape
			{
				displayName: 'URL',
				name: 'url',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'https://example.com/pricing',
				description: 'The full URL of the page, with https://',
				...show('scrape'),
			},
			{
				displayName: 'Options',
				name: 'scrapeOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				...show('scrape'),
				options: [
					{
						displayName: 'Formats',
						name: 'formats',
						type: 'multiOptions',
						default: ['markdown'],
						description: 'Which versions of the page to return',
						options: [
							{ name: 'Clean HTML', value: 'cleanHtml' },
							{ name: 'Links', value: 'links' },
							{ name: 'Markdown', value: 'markdown' },
							{ name: 'Raw HTML', value: 'rawHtml' },
							{ name: 'Text', value: 'text' },
						],
					},
					{
						displayName: 'Max Credits',
						name: 'maxCredits',
						type: 'number',
						typeOptions: { minValue: 0, maxValue: 100 },
						default: 0,
						description: 'The most this page may cost; 0 means no cap',
					},
				],
			},

			// Crawl
			{
				displayName: 'URL',
				name: 'url',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'https://docs.example.com',
				description: 'The site, or the section of it, to start from',
				...show('crawl', 'map'),
			},
			{
				displayName: 'Max Pages',
				name: 'maxPages',
				type: 'number',
				typeOptions: { minValue: 1 },
				default: 10,
				description: 'The most pages the crawl reads; each page costs credits',
				...show('crawl'),
			},
			{
				displayName: 'Wait for Completion',
				name: 'wait',
				type: 'boolean',
				default: true,
				description:
					'Whether to wait for the crawl to finish and return its pages. Off returns the crawl at once; read it later with Get Crawl.',
				...show('crawl'),
			},
			{
				displayName: 'Options',
				name: 'crawlOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				...show('crawl'),
				options: [
					{
						displayName: 'Exclude Paths',
						name: 'excludePaths',
						type: 'string',
						default: '',
						placeholder: '/tag/*, /author/*',
						description: 'Comma-separated globs of paths to skip; they win over Include Paths',
					},
					{
						displayName: 'Include Paths',
						name: 'includePaths',
						type: 'string',
						default: '',
						placeholder: '/blog/*',
						description: 'Comma-separated globs of paths to read; empty reads everything',
					},
					{
						displayName: 'Max Depth',
						name: 'maxDepth',
						type: 'number',
						typeOptions: { minValue: 0, maxValue: 10 },
						default: 3,
						description: 'How many links away from the start URL to go',
					},
					{
						displayName: 'Timeout (Minutes)',
						name: 'timeoutMinutes',
						type: 'number',
						typeOptions: { minValue: 1, maxValue: 120 },
						default: 15,
						description: 'How long to wait for the crawl before returning what has been read so far',
					},
				],
			},

			// Get Crawl
			{
				displayName: 'Crawl ID',
				name: 'crawlId',
				type: 'string',
				required: true,
				default: '',
				description: 'The ID a Crawl operation returned',
				...show('getCrawl'),
			},

			// Map
			{
				displayName: 'Options',
				name: 'mapOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				...show('map'),
				options: [
					{
						displayName: 'Limit',
						name: 'limit',
						type: 'number',
						typeOptions: { minValue: 1 },
						default: 50,
						description: 'Max number of results to return',
					},
					{
						displayName: 'Search',
						name: 'search',
						type: 'string',
						default: '',
						placeholder: 'pricing',
						description: 'Keep only the URLs that contain this text',
					},
				],
			},

			// Web Search
			{
				displayName: 'Query',
				name: 'query',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'rail funding consultation 2026',
				description: 'What to search the web for',
				...show('search'),
			},
			{
				displayName: 'Max Results',
				name: 'maxResults',
				type: 'number',
				typeOptions: { minValue: 1, maxValue: 10 },
				default: 5,
				description: 'How many results to return, 1 to 10 (one results page)',
				...show('search'),
			},
			{
				displayName: 'Read Pages',
				name: 'readPages',
				type: 'boolean',
				default: false,
				description: "Whether to also read each result's page and return its markdown. Slower, and each page costs credits.",
				...show('search'),
			},
			{
				displayName: 'Options',
				name: 'searchOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				...show('search'),
				options: [
					{
						displayName: 'Country',
						name: 'country',
						type: 'string',
						default: '',
						placeholder: 'GB',
						description: 'Two-letter country code the results are for',
					},
					{
						displayName: 'Freshness',
						name: 'freshness',
						type: 'options',
						default: '',
						options: [
							{ name: 'Any Time', value: '' },
							{ name: 'Past Day', value: 'day' },
							{ name: 'Past Hour', value: 'hour' },
							{ name: 'Past Month', value: 'month' },
							{ name: 'Past Week', value: 'week' },
							{ name: 'Past Year', value: 'year' },
						],
					},
					{
						displayName: 'Language',
						name: 'lang',
						type: 'string',
						default: '',
						placeholder: 'en',
						description: 'Language code of the results',
					},
				],
			},

			// Get Changes
			{
				displayName: 'Project',
				name: 'project',
				type: 'resourceLocator',
				required: true,
				default: { mode: 'list', value: '' },
				description: 'The MeshArc project that watches the site',
				modes: [
					{ displayName: 'From List', name: 'list', type: 'list', typeOptions: { searchListMethod: 'searchProjects', searchable: true } },
					{ displayName: 'ID', name: 'id', type: 'string', placeholder: '58a019f9742f4d488a1d108d0c2f945f' },
				],
				...show('getChanges'),
			},
			{
				displayName: 'Run ID',
				name: 'runId',
				type: 'string',
				default: '',
				description: "The run to report on; empty means the project's latest finished run",
				...show('getChanges'),
			},

			// Output
			{
				displayName: 'Simplify',
				name: 'simplify',
				type: 'boolean',
				default: true,
				description: 'Whether to return a simplified version of the response instead of the raw data',
				...show('scrape', 'crawl', 'getCrawl'),
			},
		],
	};

	methods = { listSearch: { searchProjects } };

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const out: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i) as string;
				const rows = await run.call(this, operation, i);
				for (const json of rows) out.push({ json, pairedItem: { item: i } });
			} catch (error) {
				if (this.continueOnFail()) {
					out.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				// Keep the API's message and its description, and say which item failed.
				throw new NodeOperationError(this.getNode(), error as Error, {
					itemIndex: i,
					description: (error as { description?: string }).description,
				});
			}
		}
		return [out];
	}
}

/** The rows one input item produces for an operation. */
async function run(this: IExecuteFunctions, operation: string, i: number): Promise<IDataObject[]> {
	const simplify = ['scrape', 'crawl', 'getCrawl'].includes(operation)
		? (this.getNodeParameter('simplify', i) as boolean)
		: false;
	const page = (row: IDataObject) => (simplify ? simplifyPage(row) : row);

	if (operation === 'scrape') {
		const url = this.getNodeParameter('url', i) as string;
		const options = this.getNodeParameter('scrapeOptions', i) as IDataObject;
		const formats = ((options.formats as string[]) || ['markdown']).join(',') || 'markdown';
		const body: IDataObject = { url, formats, timeout: 60 };
		if (options.maxCredits) body.maxCredits = options.maxCredits;
		let job = await mesharcRequest.call(this, 'POST', '/scrape', body);
		job = await waitForJob.call(this, job, `/scrape/${job.id}`, { formats }, 600);
		if (job.status !== 'done') {
			throw new NodeOperationError(this.getNode(), `The scrape ended ${job.status}: ${job.error || 'no page came back'}`, { itemIndex: i });
		}
		return ((job.data as IDataObject[]) || []).map(page);
	}

	if (operation === 'crawl') {
		const options = this.getNodeParameter('crawlOptions', i) as IDataObject;
		const body: IDataObject = {
			url: this.getNodeParameter('url', i) as string,
			limit: this.getNodeParameter('maxPages', i) as number,
		};
		if (options.maxDepth !== undefined) body.maxDepth = options.maxDepth;
		const include = list((options.includePaths as string) || '');
		const exclude = list((options.excludePaths as string) || '');
		if (include) body.includePaths = include;
		if (exclude) body.excludePaths = exclude;
		const job = await mesharcRequest.call(this, 'POST', '/crawl', body);
		if (!(this.getNodeParameter('wait', i) as boolean)) {
			// The crawl as it stands now, without the first pages it may already carry.
			const envelope: IDataObject = { ...job };
			delete envelope.data;
			return [envelope];
		}
		const minutes = (options.timeoutMinutes as number) || 15;
		await waitForJob.call(this, job, `/crawl/${job.id}`, { limit: 1, formats: 'markdown' }, minutes * 60, 5);
		return (await crawlPages.call(this, String(job.id))).map(page);
	}

	if (operation === 'getCrawl') {
		const id = this.getNodeParameter('crawlId', i) as string;
		return (await crawlPages.call(this, id)).map(page);
	}

	if (operation === 'map') {
		const options = this.getNodeParameter('mapOptions', i) as IDataObject;
		const body: IDataObject = { url: this.getNodeParameter('url', i) as string, timeout: 10 };
		const qs: IDataObject = {};
		if (options.search) body.search = qs.search = options.search;
		if (options.limit) body.limit = qs.limit = options.limit;
		let job = await mesharcRequest.call(this, 'POST', '/map', body);
		job = await waitForJob.call(this, job, `/map/${job.id}`, qs, 300);
		if (job.status !== 'done') {
			throw new NodeOperationError(this.getNode(), `The map ended ${job.status}: ${job.error || 'no sitemap could be read'}`, { itemIndex: i });
		}
		return (job.data as IDataObject[]) || [];
	}

	if (operation === 'search') {
		const options = this.getNodeParameter('searchOptions', i) as IDataObject;
		const body: IDataObject = {
			query: this.getNodeParameter('query', i) as string,
			limit: this.getNodeParameter('maxResults', i) as number,
			timeout: 60,
		};
		if (this.getNodeParameter('readPages', i) as boolean) body.scrape = { formats: ['markdown'] };
		for (const key of ['country', 'lang', 'freshness']) {
			if (options[key]) body[key] = options[key];
		}
		let job = await mesharcRequest.call(this, 'POST', '/search', body);
		job = await waitForJob.call(this, job, `/search/${job.id}`, undefined, 600);
		if (job.status === 'blocked') {
			throw new NodeOperationError(this.getNode(), 'Every search engine refused this search; nothing was charged. Try again later.', { itemIndex: i });
		}
		if (job.status !== 'done') {
			throw new NodeOperationError(this.getNode(), `The search ended ${job.status}: ${job.error || ''}`, { itemIndex: i });
		}
		return ((job.data as IDataObject[]) || []).map((hit) => {
			const result: IDataObject = { ...hit };
			const read = hit.page as IDataObject | undefined;
			if (read) result.page = simplifyPage(read);
			return result;
		});
	}

	if (operation === 'getChanges') {
		const projectId = this.getNodeParameter('project', i, '', { extractValue: true }) as string;
		const runId = this.getNodeParameter('runId', i) as string;
		const res = await mesharcRequest.call(this, 'GET', `/projects/${projectId}/changes`, undefined, runId ? { run_id: runId } : undefined);
		const change = res.change as IDataObject | null;
		if (!change) return [];
		return ((change.feed as IDataObject[]) || []).map((entry) => changeItem(projectId, change, entry));
	}

	throw new NodeOperationError(this.getNode(), `The operation "${operation}" is not supported`, { itemIndex: i });
}

/** Every page of a crawl, following its cursor. */
async function crawlPages(this: IExecuteFunctions, id: string): Promise<IDataObject[]> {
	const pages: IDataObject[] = [];
	let cursor: string | undefined;
	for (let guard = 0; guard < 1000; guard++) {
		const qs: IDataObject = { limit: 100, formats: 'markdown' };
		if (cursor) qs.cursor = cursor;
		const res = await mesharcRequest.call(this, 'GET', `/crawl/${id}`, undefined, qs);
		pages.push(...((res.data as IDataObject[]) || []));
		if (!res.next) break;
		cursor = new URL(String(res.next), 'https://api.mesharc.dev').searchParams.get('cursor') || undefined;
		if (!cursor) break;
	}
	return pages;
}
