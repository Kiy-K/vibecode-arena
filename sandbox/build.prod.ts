import { Template } from 'e2b';
import { template } from './template';

// Build and publish the template
async function main() {
	console.log('Building template...');
	const result = await Template.build(template, {
		alias: 'svelte-vite-sandbox'
	});
	console.log('Template built successfully!');
	console.log('Template ID:', result.templateId);
	console.log('Alias: svelte-vite-sandbox');
}

main().catch(console.error);
