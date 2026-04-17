import { test, describe } from 'node:test';
import assert from 'node:assert';
import { CopilotMoneyError } from '../../src/types/error.js';

describe('CopilotMoneyError new codes', () => {
  test('LOCAL_CACHE_MISSING round-trips to MCP error', () => {
    const err = new CopilotMoneyError(
      'LOCAL_CACHE_MISSING',
      'Copilot Money not installed or never opened.'
    );
    const mcp = err.toMcpError();
    assert.strictEqual(mcp.code, 'LOCAL_CACHE_MISSING');
  });

  test('LOCAL_CACHE_LOCKED', () => {
    const err = new CopilotMoneyError('LOCAL_CACHE_LOCKED', 'x');
    assert.strictEqual(err.toMcpError().code, 'LOCAL_CACHE_LOCKED');
  });

  test('ENTITY_NOT_CACHED carries suggestions', () => {
    const err = new CopilotMoneyError('ENTITY_NOT_CACHED', 'x', ['2026-01', '2026-02']);
    assert.deepStrictEqual(err.toMcpError().suggestions, ['2026-01', '2026-02']);
  });

  test('OOB_CODE_INVALID', () => {
    assert.strictEqual(
      new CopilotMoneyError('OOB_CODE_INVALID', 'x').toMcpError().code,
      'OOB_CODE_INVALID'
    );
  });

  test('SEND_OOB_CODE_FAILED', () => {
    assert.strictEqual(
      new CopilotMoneyError('SEND_OOB_CODE_FAILED', 'x').toMcpError().code,
      'SEND_OOB_CODE_FAILED'
    );
  });

  test('CACHE_DECODE_ERROR', () => {
    assert.strictEqual(
      new CopilotMoneyError('CACHE_DECODE_ERROR', 'x').toMcpError().code,
      'CACHE_DECODE_ERROR'
    );
  });
});
