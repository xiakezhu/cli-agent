import { describe, expect, test } from 'bun:test';
import { ToolError, withTimeout, sanitizeError } from '../toolError';
import { z } from 'zod';

describe('ToolError', () => {
  test('ToolError stores toolName and code', () => {
    const err = new ToolError('testTool', 'Something went wrong', 'TEST_ERROR');
    expect(err.name).toBe('ToolError');
    expect(err.toolName).toBe('testTool');
    expect(err.message).toBe('Something went wrong');
    expect(err.code).toBe('TEST_ERROR');
  });

  test('ToolError works without code', () => {
    const err = new ToolError('testTool', 'Message only');
    expect(err.code).toBeUndefined();
  });
});

describe('withTimeout', () => {
  test('resolves when promise completes quickly', async () => {
    const controller = new AbortController();
    const result = await withTimeout(
      Promise.resolve('success'),
      1000,
      controller,
    );
    expect(result).toBe('success');
  });

  test('throws ToolError with TIMEOUT code when slow', async () => {
    const controller = new AbortController();
    await expect(
      withTimeout(
        new Promise(resolve => setTimeout(resolve, 200)),
        50,
        controller,
      ),
    ).rejects.toThrow('timed out after 50ms');
  });

  test('aborts the controller on timeout', async () => {
    const controller = new AbortController();
    let aborted = false;
    const slowPromise = new Promise(resolve => {
      controller.signal.addEventListener('abort', () => {
        aborted = true;
      });
      setTimeout(resolve, 200);
    });

    await expect(withTimeout(slowPromise, 50, controller)).rejects.toThrow();
    expect(aborted).toBe(true);
  });

  test('works without a controller', async () => {
    await expect(
      withTimeout(new Promise(resolve => setTimeout(resolve, 200)), 50),
    ).rejects.toThrow('timed out');
  });

  test('uses default 15s timeout when ms not provided', async () => {
    const controller = new AbortController();
    const quickPromise = Promise.resolve('done');
    const result = await withTimeout(quickPromise, undefined, controller);
    expect(result).toBe('done');
  });

  test('custom timeout overrides default', async () => {
    const controller = new AbortController();
    await expect(
      withTimeout(
        new Promise(resolve => setTimeout(resolve, 200)),
        50,
        controller,
      ),
    ).rejects.toThrow('timed out after 50ms');
  });
});

describe('sanitizeError', () => {
  test('sanitizes ToolError message (no secrets), preserves toolName and code', () => {
    const original = new ToolError('testTool', 'Original message', 'CODE');
    const sanitized = sanitizeError(original, 'testTool');
    expect(sanitized).not.toBe(original); // creates a new instance
    expect(sanitized.toolName).toBe('testTool');
    expect(sanitized.code).toBe('CODE');
    expect(sanitized.message).toBe('Original message');
  });

  test('normalizes Error to ToolError', () => {
    const err = new Error('Something failed');
    const sanitized = sanitizeError(err, 'myTool');
    expect(sanitized).toBeInstanceOf(ToolError);
    expect(sanitized.toolName).toBe('myTool');
    expect(sanitized.message).toBe('Something failed');
    expect(sanitized.code).toBeUndefined();
  });

  test('normalizes string to ToolError', () => {
    const sanitized = sanitizeError('String error', 'myTool');
    expect(sanitized).toBeInstanceOf(ToolError);
    expect(sanitized.toolName).toBe('myTool');
    expect(sanitized.message).toBe('String error');
    expect(sanitized.code).toBeUndefined();
  });

  test('normalizes unknown to ToolError with UNKNOWN code', () => {
    const sanitized = sanitizeError(null, 'myTool');
    expect(sanitized).toBeInstanceOf(ToolError);
    expect(sanitized.toolName).toBe('myTool');
    expect(sanitized.message).toBe('Unknown error');
    expect(sanitized.code).toBe('UNKNOWN');
  });

  test('removes Bearer tokens', () => {
    const err = new Error('Authorization: Bearer sk-1234567890abcdef');
    const sanitized = sanitizeError(err, 'testTool');
    expect(sanitized.message).toBe('Authorization: Bearer <REDACTED>');
  });

  test('truncates long messages', () => {
    const longMessage = 'x'.repeat(300);
    const err = new Error(longMessage);
    const sanitized = sanitizeError(err, 'testTool');
    expect(sanitized.message).toHaveLength(200 + '... (truncated)'.length);
    expect(sanitized.message).toContain('... (truncated)');
  });

  test('does not truncate short messages', () => {
    const shortMessage = 'Short error';
    const err = new Error(shortMessage);
    const sanitized = sanitizeError(err, 'testTool');
    expect(sanitized.message).toBe(shortMessage);
    expect(sanitized.message).not.toContain('truncated');
  });

  test('strips secrets from ToolError messages', () => {
    const err = new ToolError('apiTool', 'Response: Bearer abc123');
    const sanitized = sanitizeError(err, 'apiTool');
    expect(sanitized.message).toBe('Response: Bearer <REDACTED>');
    expect(sanitized.toolName).toBe('apiTool');
  });

  test('case-insensitive Bearer replacement (always outputs "Bearer")', () => {
    const err = new Error('bearer lower');
    const sanitized = sanitizeError(err, 'testTool');
    expect(sanitized.message).toBe('Bearer <REDACTED>');
  });
});