import { unstable_dev } from 'wrangler';
import type { UnstableDevWorker } from 'wrangler';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import testRequest from '../assets/request.json';

describe('Worker', () => {
	let worker: UnstableDevWorker;

	beforeAll(async () => {
		worker = await unstable_dev('src/index.ts', {}, { disableExperimentalWarning: true });
	});

	afterAll(async () => {
		await worker.stop();
	});

	it('should return 200 response', async () => {
		const resp = await worker.fetch('https://example.com', {
			method: 'POST',
			body: JSON.stringify(testRequest),
			headers: {
				'Content-Type': 'application/json; charset=utf-8',
			},
		});
		
		expect(resp.status).toBe(200);
		const response = (await resp.json()) as any;
		expect(response.result.generator).toBe('ts');
	});
});
