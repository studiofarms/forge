// Shared types for the ComfyUI integration layer.

export interface SystemStats {
  comfyVersion: string;
  os: string;
  pythonVersion: string;
  devices: GpuDevice[];
}

export interface GpuDevice {
  name: string;
  type: string;
  vramTotal: number;
  vramFree: number;
}

export interface QueueSnapshot {
  running: number;
  pending: number;
}

export interface PromptSubmitResult {
  promptId: string;
  number: number;
  nodeErrors: Record<string, unknown>;
}

export interface OutputFileRef {
  filename: string;
  subfolder: string;
  type: string; // 'output' | 'temp'
  format?: string;
}

/** Progress event surfaced from the ComfyUI websocket. */
export type ComfyWsEvent =
  | { kind: 'status'; queueRemaining: number }
  | { kind: 'execution_start'; promptId: string }
  | { kind: 'executing'; promptId: string; node: string | null }
  | { kind: 'progress'; promptId: string | null; value: number; max: number }
  | { kind: 'executed'; promptId: string; node: string; outputs: OutputFileRef[] }
  | { kind: 'execution_success'; promptId: string }
  | { kind: 'execution_error'; promptId: string; message: string }
  | { kind: 'execution_interrupted'; promptId: string }
  | { kind: 'unknown'; type: string };

export interface UploadImageResult {
  name: string;
  subfolder: string;
  type: string;
}

export type ComfyWorkflow = Record<
  string,
  { class_type: string; inputs: Record<string, unknown>; _meta?: { title: string } }
>;
