import type {
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeBaseDescription,
	INodeTypeDescription,
	IPollFunctions,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

import { changeItem, mesharcRequest, searchProjects } from '../../MeshArc/GenericFunctions';

/** At most this many new runs are reported in one poll; older unseen ones are skipped. */
const MAX_RUNS_PER_POLL = 10;

/** Version 1: polls the project's changes on n8n's schedule. Workflows made with it keep it. */
export class MeshArcTriggerV1 implements INodeType {
	description: INodeTypeDescription;

	constructor(baseDescription: INodeTypeBaseDescription) {
		this.description = {
			...baseDescription,
			version: 1,
			subtitle: 'Page changed',
			defaults: { name: 'MeshArc Trigger' },
			credentials: [{ name: 'mesharcApi', required: true }],
			polling: true,
			inputs: [],
			outputs: [NodeConnectionTypes.Main],
			properties: [
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
						{ name: 'Modified', value: 'modified', description: "A page whose text changed" },
						{ name: 'Removed', value: 'removed', description: 'A page that is gone' },
					],
				},
			],
		};
	}

	methods = { listSearch: { searchProjects } };

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const state = this.getWorkflowStaticData('node');
		const projectId = this.getNodeParameter('project', '', { extractValue: true }) as string;
		const kinds = this.getNodeParameter('kinds', []) as string[];

		const latest = await mesharcRequest.call(this, 'GET', `/projects/${projectId}/changes`);
		// Finished runs, newest first, each with the id of its change record.
		const runs = ((latest.runs as IDataObject[]) || []).filter((run) => run.id);

		const items = async (run: IDataObject): Promise<IDataObject[]> => {
			// A run whose record is not stored yet is still asked for: the API computes it on demand.
			if (run.baseline) return [];
			const res = await mesharcRequest.call(this, 'GET', `/projects/${projectId}/changes`, undefined, {
				run_id: run.id,
			});
			const change = res.change as IDataObject | null;
			if (!change) return [];
			return ((change.feed as IDataObject[]) || [])
				.filter((entry) => kinds.includes(String(entry.kind)))
				.map((entry) => changeItem(projectId, change, entry));
		};

		if (this.getMode() === 'manual') {
			// "Fetch test event": the latest run that changed something, without moving the cursor.
			for (const run of runs.slice(0, MAX_RUNS_PER_POLL)) {
				const found = await items(run);
				if (found.length) return [this.helpers.returnJsonArray(found)];
			}
			return null;
		}

		if (!runs.length) return null;
		const newest = String(runs[0].id);
		if (!state.lastRunId) {
			// First poll after activation: remember where the project is, report nothing old.
			state.lastRunId = newest;
			return null;
		}
		const seenAt = runs.findIndex((run) => run.id === state.lastRunId);
		const unseen = (seenAt === -1 ? runs : runs.slice(0, seenAt)).slice(0, MAX_RUNS_PER_POLL).reverse();
		if (!unseen.length) return null;

		const found: IDataObject[] = [];
		for (const run of unseen) found.push(...(await items(run)));
		// Only after every run was read, so a failed poll is retried next time.
		state.lastRunId = newest;
		return found.length ? [this.helpers.returnJsonArray(found)] : null;
	}
}
