import type { INodeTypeBaseDescription, IVersionedNodeType } from 'n8n-workflow';
import { VersionedNodeType } from 'n8n-workflow';

import { MeshArcTriggerV1 } from './v1/MeshArcTriggerV1';
import { MeshArcTriggerV2 } from './v2/MeshArcTriggerV2';

/**
 * Version 2 (the default for new workflows) is instant: MeshArc posts each finished run.
 * Version 1 polls; workflows made with it keep polling.
 */
export class MeshArcTrigger extends VersionedNodeType {
	constructor() {
		const baseDescription: INodeTypeBaseDescription = {
			displayName: 'MeshArc Trigger',
			name: 'meshArcTrigger',
			icon: { light: 'file:../../icons/mesharc.svg', dark: 'file:../../icons/mesharc.dark.svg' },
			group: ['trigger'],
			description: 'Starts the workflow when a run of a MeshArc project finds pages added, changed or removed',
			defaultVersion: 2,
		};
		const nodeVersions: IVersionedNodeType['nodeVersions'] = {
			1: new MeshArcTriggerV1(baseDescription),
			2: new MeshArcTriggerV2(baseDescription),
		};
		super(nodeVersions, baseDescription);
	}
}
