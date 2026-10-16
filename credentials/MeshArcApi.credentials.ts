import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class MeshArcApi implements ICredentialType {
	name = 'mesharcApi';

	displayName = 'MeshArc API';

	icon: Icon = { light: 'file:../icons/mesharc.svg', dark: 'file:../icons/mesharc.dark.svg' };

	documentationUrl = 'https://github.com/mesharc-org/n8n-nodes-mesharc?tab=readme-ov-file#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'A MeshArc API key, made under Settings → API keys at mesharc.dev. Scraping, crawling, mapping and searching need a key that can write.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.mesharc.dev/api/v1',
			url: '/me',
			method: 'GET',
		},
	};
}
