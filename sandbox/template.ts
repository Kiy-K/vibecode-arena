import { Template } from 'e2b';

// ONE sandbox per game room, each player has their own solution file
export const template = Template()
	.fromNodeImage('20')
	.setWorkdir('/home/user/app')

	// Copy project files from files/ subdirectory
	.copy('files/package.json', '/home/user/app/package.json')
	.copy('files/vite.config.js', '/home/user/app/vite.config.js')
	.copy('files/svelte.config.js', '/home/user/app/svelte.config.js')
	.copy('files/index.html', '/home/user/app/index.html')
	.copy('files/src/', '/home/user/app/src/')

	// Install dependencies
	.npmInstall()

	// Pre-warm Vite cache for faster startup
	.runCmd('timeout 10 npm run dev || true')

	.setWorkdir('/home/user/app');

export default template;
