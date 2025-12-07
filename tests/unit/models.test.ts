import { describe, it, expect } from 'vitest';
import {
	MODELS,
	ENABLED_MODEL_IDS,
	getModelMultiplier,
	isModelEnabled,
	DEFAULT_MODEL,
	type ModelId
} from '$lib/config/models';

describe('MODELS', () => {
	it('has at least one model', () => {
		expect(MODELS.length).toBeGreaterThan(0);
	});

	it('all models have required fields', () => {
		for (const model of MODELS) {
			expect(model.id).toBeTruthy();
			expect(model.name).toBeTruthy();
			expect(model.provider).toBeTruthy();
			expect(typeof model.multiplier).toBe('number');
			expect(model.multiplier).toBeGreaterThan(0);
		}
	});

	it('has unique model IDs', () => {
		const ids = MODELS.map((m) => m.id);
		const uniqueIds = new Set(ids);
		expect(uniqueIds.size).toBe(ids.length);
	});

	it('multipliers are reasonable (0.5 to 2.0)', () => {
		for (const model of MODELS) {
			expect(model.multiplier).toBeGreaterThanOrEqual(0.5);
			expect(model.multiplier).toBeLessThanOrEqual(2.0);
		}
	});
});

describe('ENABLED_MODEL_IDS', () => {
	it('is not empty', () => {
		expect(ENABLED_MODEL_IDS.length).toBeGreaterThan(0);
	});

	it('only contains valid model IDs', () => {
		const allIds = MODELS.map((m) => m.id);
		for (const id of ENABLED_MODEL_IDS) {
			expect(allIds).toContain(id);
		}
	});
});

describe('getModelMultiplier', () => {
	it('returns correct multiplier for valid model', () => {
		const model = MODELS[0];
		const multiplier = getModelMultiplier(model.id as ModelId);
		expect(multiplier).toBe(model.multiplier);
	});

	it('returns 1.0 for invalid model', () => {
		const multiplier = getModelMultiplier('invalid/model' as ModelId);
		expect(multiplier).toBe(1.0);
	});
});

describe('isModelEnabled', () => {
	it('returns true for enabled models', () => {
		for (const id of ENABLED_MODEL_IDS) {
			expect(isModelEnabled(id)).toBe(true);
		}
	});

	it('returns false for invalid model', () => {
		expect(isModelEnabled('invalid/model')).toBe(false);
	});
});

describe('DEFAULT_MODEL', () => {
	it('is a valid model ID', () => {
		const allIds = MODELS.map((m) => m.id);
		expect(allIds).toContain(DEFAULT_MODEL);
	});

	it('is enabled', () => {
		expect(isModelEnabled(DEFAULT_MODEL)).toBe(true);
	});
});
