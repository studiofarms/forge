import { describe, expect, it } from 'vitest';
import { isTerminal, transition, type JobState } from '@/lib/jobs/stateMachine';

describe('job state machine', () => {
  it('walks the happy path draft → completed', () => {
    let s: JobState = 'draft';
    s = transition(s, { type: 'SUBMIT_OK', promptId: 'p' })!;
    expect(s).toBe('submitted');
    s = transition(s, { type: 'EXECUTION_START' })!;
    expect(s).toBe('running');
    s = transition(s, { type: 'EXECUTION_SUCCESS' })!;
    expect(s).toBe('downloading');
    s = transition(s, { type: 'DOWNLOAD_OK' })!;
    expect(s).toBe('completed');
    expect(isTerminal(s)).toBe(true);
  });

  it('treats progress as an implicit execution start', () => {
    expect(transition('submitted', { type: 'PROGRESS', value: 1, max: 10 })).toBe('running');
    expect(transition('running', { type: 'PROGRESS', value: 2, max: 10 })).toBeNull();
  });

  it('terminal states absorb every event', () => {
    for (const s of ['completed', 'failed', 'cancelled'] as JobState[]) {
      expect(transition(s, { type: 'CANCEL' })).toBeNull();
      expect(transition(s, { type: 'EXECUTION_ERROR', error: 'x' })).toBeNull();
      expect(transition(s, { type: 'SUBMIT_OK', promptId: 'p' })).toBeNull();
    }
  });

  it('fails from any live state on execution error', () => {
    for (const s of ['draft', 'submitted', 'running', 'downloading'] as JobState[]) {
      expect(transition(s, { type: 'EXECUTION_ERROR', error: 'boom' })).toBe('failed');
    }
  });

  it('cancel works from any live state', () => {
    for (const s of ['draft', 'submitted', 'running'] as JobState[]) {
      expect(transition(s, { type: 'CANCEL' })).toBe('cancelled');
    }
  });

  it('connection loss only kills drafts', () => {
    expect(transition('draft', { type: 'CONNECTION_LOST' })).toBe('failed');
    expect(transition('running', { type: 'CONNECTION_LOST' })).toBeNull();
    expect(transition('submitted', { type: 'CONNECTION_LOST' })).toBeNull();
  });

  it('throws on programmer-error transitions', () => {
    expect(() => transition('running', { type: 'SUBMIT_OK', promptId: 'p' })).toThrow();
  });

  it('ignores stray success in draft and duplicate downloads', () => {
    expect(transition('draft', { type: 'EXECUTION_SUCCESS' })).toBeNull();
    expect(transition('running', { type: 'DOWNLOAD_OK' })).toBeNull();
  });
});
