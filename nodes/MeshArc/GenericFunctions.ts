import { createHmac, timingSafeEqual } from 'crypto';
import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INodeListSearchResult,
	IPollFunctions,
	IWebhookFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, sleep } from 'n8n-workflow';

export const BASE_URL = 'https://api.mesharc.dev/api/v1';

type Context = IExecuteFunctions | IPollFunctions | ILoadOptionsFunctions | IHookFunctions | IWebhookFunctions;

/** One authenticated call to the MeshArc API. Refusals become a NodeApiError with the API's own message. */
export async function mesharcRequest(
	this: Context,
	method: IHttpRequestMethods,
	path: string,
	body?: IDataObject,
	qs?: IDataObject,
): Promise<IDataObject> {
	const options: IHttpRequestOptions = { method, url: `${BASE_URL}${path}`, json: true };
	if (body !== undefined) options.body = body;
	if (qs !== undefined) options.qs = qs;
	try {
		return (await this.helpers.httpRequestWithAuthentication.call(this, 'mesharcApi', options)) as IDataObject;
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as JsonObject);
	}
}

/** A job is still going while its status is one of these. */
export function isRunning(status: unknown): boolean {
	return status === 'queued' || status === 'running' || status === 'pending';
}

/**
 * Fetch `path` until the job it names is no longer running, or until
 * `timeoutSeconds` have passed (then the last answer is returned as it is).
 */
export async function waitForJob(
	this: IExecuteFunctions,
	first: IDataObject,
	path: string,
	qs: IDataObject | undefined,
	timeoutSeconds: number,
	pollSeconds = 3,
): Promise<IDataObject> {
	let current = first;
	const deadline = Date.now() + timeoutSeconds * 1000;
	while (isRunning(current.status) && Date.now() < deadline) {
		await sleep(pollSeconds * 1000);
		current = await mesharcRequest.call(this, 'GET', path, undefined, qs);
	}
	return current;
}

/** The fields of a page most workflows want, under plain names. */
export function simplifyPage(row: IDataObject): IDataObject {
	const head = (row.head as IDataObject) || {};
	const status = row.status;
	const httpStatus = row.httpStatus ?? (typeof status === 'number' ? status : undefined);
	const pageStatus = row.pageStatus ?? (typeof status === 'string' ? status : undefined);
	return {
		url: row.url,
		title: row.title ?? head.title ?? '',
		markdown: row.markdown ?? '',
		httpStatus: httpStatus ?? null,
		pageStatus: pageStatus ?? null,
		words: row.words ?? null,
		language: row.language ?? null,
		credits: row.credits ?? null,
		crawledAt: row.crawledAt ?? null,
	};
}

/** `+759` or `− 748` (as the change feed writes them) as a number. */
export function wordCount(value: unknown): number {
	const digits = String(value ?? '').replace(/[^0-9]/g, '');
	return digits ? Number(digits) : 0;
}

/** One changed page of a change record, as a flat item. */
export function changeItem(projectId: string, change: IDataObject, entry: IDataObject): IDataObject {
	return {
		projectId,
		runId: change.runId ?? null,
		previousRunId: change.prevRunId ?? null,
		changeId: change.id ?? null,
		changedAt: change.createdAt ?? null,
		kind: entry.kind,
		url: entry.url,
		path: entry.path ?? null,
		title: entry.section ?? '',
		wordsAdded: wordCount(entry.added),
		wordsRemoved: wordCount(entry.removed),
		wordsBefore: entry.wordsBefore ?? null,
		wordsAfter: entry.wordsAfter ?? null,
		fields: entry.fields ?? [],
	};
}

/**
 * The changed pages one finished run of a project found, of the kinds asked for, as items.
 * A baseline run (the first, or the first after a change of settings) compares nothing.
 */
export async function runChangeItems(
	this: Context,
	projectId: string,
	runId: string,
	kinds: string[],
): Promise<IDataObject[]> {
	const res = await mesharcRequest.call(this, 'GET', `/projects/${projectId}/changes`, undefined, { run_id: runId });
	const change = res.change as IDataObject | null;
	if (!change) return [];
	return ((change.feed as IDataObject[]) || [])
		.filter((entry) => kinds.includes(String(entry.kind)))
		.map((entry) => changeItem(projectId, change, entry));
}

/** Is `header` (X-MeshArc-Signature, `sha256=<hex>`) the HMAC of `body` under `secret`? */
export function validSignature(secret: string, body: Buffer, header: string): boolean {
	if (!secret || !header) return false;
	const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(body).digest('hex')}`);
	const given = Buffer.from(header);
	return given.length === expected.length && timingSafeEqual(given, expected);
}

/** The workspace's projects, for the project picker. */
export async function searchProjects(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
	const rows = (await mesharcRequest.call(this, 'GET', '/projects')) as unknown as IDataObject[];
	const wanted = (filter || '').toLowerCase();
	return {
		results: (Array.isArray(rows) ? rows : [])
			.filter((p) => !wanted || String(p.name ?? '').toLowerCase().includes(wanted) || String(p.host ?? '').toLowerCase().includes(wanted))
			.map((p) => {
				const name = String(p.name ?? p.id);
				// The site in brackets, unless the name already says it.
				const host = p.host && !name.includes(String(p.host)) ? ` (${p.host})` : '';
				return { name: `${name}${host}`, value: String(p.id) };
			}),
	};
}
