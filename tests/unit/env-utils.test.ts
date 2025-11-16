import { afterEach, describe, expect, it } from 'vitest';
import { getBooleanEnv, getNumberEnv, getOptionalEnv, getRequiredEnv } from '../../src/utils/env';

const originalValues = new Map<string, string | undefined>();

const setEnv = (key: string, value?: string): void => {
  if (!originalValues.has(key)) {
    originalValues.set(key, process.env[key]);
  }

  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
};

afterEach(() => {
  originalValues.forEach((value, key) => {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  });

  originalValues.clear();
});

describe('getRequiredEnv', () => {
  it('returns a trimmed value when present', () => {
    setEnv('MCP_REQUIRED', '  ready ');
    expect(getRequiredEnv('MCP_REQUIRED')).toBe('ready');
  });

  it('throws when the variable is missing', () => {
    expect(() => getRequiredEnv('DOES_NOT_EXIST')).toThrow(/DOES_NOT_EXIST/);
  });
});

describe('getOptionalEnv', () => {
  it('falls back to the provided default', () => {
    expect(getOptionalEnv('MCP_OPTIONAL', 'fallback')).toBe('fallback');
  });

  it('returns the normalized value when present', () => {
    setEnv('MCP_OPTIONAL_PRESENT', '\tDone ');
    expect(getOptionalEnv('MCP_OPTIONAL_PRESENT')).toBe('Done');
  });
});

describe('getBooleanEnv', () => {
  it('parses known truthy and falsy values', () => {
    setEnv('FEATURE_TRUE', 'YeS');
    setEnv('FEATURE_FALSE', 'Off');

    expect(getBooleanEnv('FEATURE_TRUE')).toBe(true);
    expect(getBooleanEnv('FEATURE_FALSE')).toBe(false);
  });

  it('uses the default when missing', () => {
    expect(getBooleanEnv('FEATURE_DEFAULT', true)).toBe(true);
    expect(getBooleanEnv('FEATURE_DEFAULT_FALSE', false)).toBe(false);
  });

  it('throws when value cannot be parsed', () => {
    setEnv('FEATURE_INVALID', 'maybe');
    expect(() => getBooleanEnv('FEATURE_INVALID')).toThrow(/FEATURE_INVALID/);
  });
});

describe('getNumberEnv', () => {
  it('parses numeric values and enforces bounds', () => {
    setEnv('PORT', '8080');
    expect(getNumberEnv('PORT', { min: 1024, max: 9000 })).toBe(8080);
  });

  it('returns the default when missing', () => {
    expect(getNumberEnv('PORT_DEFAULT', { defaultValue: 3000 })).toBe(3000);
  });

  it('throws when value is outside allowed bounds', () => {
    setEnv('PORT_LOW', '10');
    expect(() => getNumberEnv('PORT_LOW', { min: 100 })).toThrow(/>= 100/);

    setEnv('PORT_HIGH', '100');
    expect(() => getNumberEnv('PORT_HIGH', { max: 50 })).toThrow(/<= 50/);
  });

  it('throws when the value cannot be parsed', () => {
    setEnv('PORT_INVALID', 'not-a-number');
    expect(() => getNumberEnv('PORT_INVALID')).toThrow(/Invalid numeric/);
  });
});
