// Pure job state machine. The runner drives transitions; the store just
// records them. Illegal transitions throw so bugs surface in tests.

export type JobState =
  | 'draft' // created locally, not yet sent
  | 'submitted' // accepted by ComfyUI, waiting in its queue
  | 'running' // actively sampling
  | 'downloading' // finished on GPU, pulling video into the gallery
  | 'completed'
  | 'failed'
  | 'cancelled';

export type JobEvent =
  | { type: 'SUBMIT_OK'; promptId: string }
  | { type: 'SUBMIT_FAIL'; error: string }
  | { type: 'EXECUTION_START' }
  | { type: 'PROGRESS'; value: number; max: number }
  | { type: 'EXECUTION_SUCCESS' }
  | { type: 'DOWNLOAD_OK' }
  | { type: 'DOWNLOAD_FAIL'; error: string }
  | { type: 'EXECUTION_ERROR'; error: string }
  | { type: 'INTERRUPTED' }
  | { type: 'CANCEL' }
  | { type: 'CONNECTION_LOST' };

export const TERMINAL_STATES: ReadonlySet<JobState> = new Set([
  'completed',
  'failed',
  'cancelled',
]);

export function isTerminal(state: JobState): boolean {
  return TERMINAL_STATES.has(state);
}

/**
 * Returns the next state for (state, event), or null when the event is
 * irrelevant in that state (e.g. duplicate websocket messages) — callers
 * ignore nulls. Throws only on programmer error (submitting a running job).
 */
export function transition(state: JobState, event: JobEvent): JobState | null {
  if (isTerminal(state)) {
    return null; // terminal states absorb every event
  }
  switch (event.type) {
    case 'SUBMIT_OK':
      if (state !== 'draft') throw new Error(`SUBMIT_OK in state ${state}`);
      return 'submitted';
    case 'SUBMIT_FAIL':
      if (state !== 'draft') throw new Error(`SUBMIT_FAIL in state ${state}`);
      return 'failed';
    case 'EXECUTION_START':
      return state === 'submitted' ? 'running' : null;
    case 'PROGRESS':
      // Progress implies running even if we missed execution_start.
      return state === 'submitted' ? 'running' : null;
    case 'EXECUTION_SUCCESS':
      return state === 'submitted' || state === 'running' ? 'downloading' : null;
    case 'DOWNLOAD_OK':
      return state === 'downloading' ? 'completed' : null;
    case 'DOWNLOAD_FAIL':
      return state === 'downloading' ? 'failed' : null;
    case 'EXECUTION_ERROR':
      return 'failed';
    case 'INTERRUPTED':
    case 'CANCEL':
      return 'cancelled';
    case 'CONNECTION_LOST':
      // Jobs already on the GPU may still finish; only drafts die.
      return state === 'draft' ? 'failed' : null;
    default:
      return null;
  }
}
