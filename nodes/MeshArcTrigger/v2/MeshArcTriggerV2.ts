import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeBaseDescription,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes } from 'n8n-workflow';

import {
	BASE_URL,
	mesharcRequest,
	runChangeItems,
	searchProjects,
	validSignature,
} from '../../MeshArc/GenericFunctions';

/** The event the subscription asks MeshArc for: every finished run, whose changes are then read. */
const SUBSCRIBED_EVENTS = ['run.finished'];

/** Remove a subscription in MeshArc. One already gone (removed there, or with its project) is fine. */
async function removeSubscription(this: IHookFunctions, id: string): Promise<void> {
	const res = (await this.helpers.httpRequestWithAuthentication.call(this, 'mesharcApi', {
		method: 'DELETE',
		url: `${BASE_URL}/webhooks/subscriptions/${encodeURIComponent(id)}`,
		json: true,
		ignoreHttpStatusErrors: true,
		returnFullResponse: true,
	})) as { statusCode: number; body: JsonObject };
	if (res.statusCode >= 400 && res.statusCode !== 404) {
		throw new NodeApiError(this.getNode(), res.body ?? {}, { httpCode: String(res.statusCode) });
	}
}

/**
 * Version 2: instant. Activating the workflow subscribes this trigger's URL to the project's
 * runs; MeshArc posts each finished run, signed, and the run's changed pages start the workflow.
 * The items are the ones version 1 makes for the same run.
 */
export class MeshArcTriggerV2 implements INodeType {
	description: INodeTypeDescription;

	constructor(baseDescription: INodeTypeBaseDescription) {
		this.description = {
			...baseDescription,
			version: 2,
			subtitle: 'Page changed',
			defaults: { name: 'MeshArc Trigger' },
			credentials: [{ name: 'mesharcApi', required: true }],
			inputs: [],
			outputs: [NodeConnectionTypes.Main],
			webhooks: [{ name: 'default', httpMethod: 'POST', responseMode: 'onReceived', path: 'webhook' }],
			properties: [
				{
					displayName:
						'MeshArc sends each finished run to this workflow as it happens, so n8n must be reachable from the internet (a public URL, not localhost)',
					name: 'notice',
					type: 'notice',
					default: '',
				},
				{
					displayName: 'Event',
					name: 'event',
					type: 'options',
					noDataExpression: true,
					default: 'pageChanged',
					options: [
						{
							name: 'Page Changed',
							value: 'pageChanged',
							description: 'A finished run of the project found a page added, changed or removed',
						},
					],
				},
				{
					displayName: 'Project',
					name: 'project',
					type: 'resourceLocator',
					required: true,
					default: { mode: 'list', value: '' },
					description: 'The MeshArc project that watches the site. Its runs are scheduled in MeshArc.',
					modes: [
						{ displayName: 'From List', name: 'list', type: 'list', typeOptions: { searchListMethod: 'searchProjects', searchable: true } },
						{ displayName: 'ID', name: 'id', type: 'string', placeholder: '58a019f9742f4d488a1d108d0c2f945f' },
					],
				},
				{
					displayName: 'Changes',
					name: 'kinds',
					type: 'multiOptions',
					default: ['added', 'modified', 'removed'],
					description: 'Which kinds of change start the workflow',
					options: [
						{ name: 'Added', value: 'added', description: 'A page that was not there before' },
						{ name: 'Fields Changed', value: 'fields', description: 'Only extracted fields changed, not the text' },
						{ name: 'Modified', value: 'modified', description: 'A page whose text changed' },
						{ name: 'Removed', value: 'removed', description: 'A page that is gone' },
					],
				},
			],
		};
	}

	methods = { listSearch: { searchProjects } };

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node');
				if (!data.subscriptionId || !data.secret) return false;
				const projectId = this.getNodeParameter('project', '', { extractValue: true }) as string;
				const res = await mesharcRequest.call(this, 'GET', '/webhooks/subscriptions', undefined, { projectId });
				const url = this.getNodeWebhookUrl('default');
				const found = ((res.subscriptions as IDataObject[]) || []).some(
					(sub) => sub.id === data.subscriptionId && sub.url === url,
				);
				if (!found) {
					// Its URL or project is no longer this trigger's (n8n's public URL changed, say):
					// remove it, so MeshArc stops posting there, before a new one is made.
					await removeSubscription.call(this, String(data.subscriptionId));
					delete data.subscriptionId;
					delete data.secret;
				}
				return found;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node');
				const projectId = this.getNodeParameter('project', '', { extractValue: true }) as string;
				const res = await mesharcRequest.call(this, 'POST', '/webhooks/subscriptions', {
					projectId,
					url: this.getNodeWebhookUrl('default') as string,
					events: SUBSCRIBED_EVENTS,
					label: 'n8n',
				});
				const sub = (res.subscription as IDataObject) || {};
				if (!sub.id || !sub.secret) return false;
				data.subscriptionId = sub.id;
				data.secret = sub.secret;
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node');
				if (data.subscriptionId) await removeSubscription.call(this, String(data.subscriptionId));
				delete data.subscriptionId;
				delete data.secret;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const data = this.getWorkflowStaticData('node');
		const req = this.getRequestObject() as unknown as { rawBody?: Buffer };
		const headers = this.getHeaderData() as IDataObject;
		// Only messages MeshArc signed with this subscription's secret start the workflow.
		if (!req.rawBody || !validSignature(String(data.secret ?? ''), req.rawBody, String(headers['x-mesharc-signature'] ?? ''))) {
			this.getResponseObject().status(401).json({ error: 'invalid signature' });
			return { noWebhookResponse: true };
		}
		if (headers['x-mesharc-event'] !== 'run.finished') return {};

		const message = (this.getBodyData().data as IDataObject) || {};
		const project = (message.project as IDataObject) || {};
		const run = (message.run as IDataObject) || {};
		const projectId = this.getNodeParameter('project', '', { extractValue: true }) as string;
		// A baseline run compares nothing; a run of another project is not this trigger's.
		if (message.baseline || project.id !== projectId || !run.id) return {};

		const kinds = this.getNodeParameter('kinds', []) as string[];
		const found = await runChangeItems.call(this, projectId, String(run.id), kinds);
		if (!found.length) return {};
		return { workflowData: [this.helpers.returnJsonArray(found)] };
	}
}
