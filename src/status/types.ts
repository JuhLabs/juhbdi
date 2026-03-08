// src/status/types.ts

export interface ProjectStatus {
  beliefs: BeliefStatus | null;
  intentions: IntentionStatus | null;
  trail: TrailStatus;
  recovery: RecoveryStatus;
}

export interface BeliefStatus {
  project_name: string;
  architecture: string;
  conventions: string[];
  last_updated: string;
  active_wave_id?: string;
  active_task_id?: string;
}

export interface IntentionStatus {
  total_waves: number;
  total_tasks: number;
  wave_details: WaveDetail[];
  overall_progress: number; // 0-100
}

export interface WaveDetail {
  id: string;
  parallel: boolean;
  pending: number;
  running: number;
  passed: number;
  failed: number;
  blocked: number;
}

export interface TrailStatus {
  total_entries: number;
  latest_entry?: { event_type: string; description: string; timestamp: string };
}

export interface RecoveryStatus {
  tasks_with_retries: number;
  total_retries: number;
  banned_approaches: { task_id: string; approaches: string[] }[];
  failure_patterns: FailurePattern[];
}

export interface FailurePattern {
  pattern: string;       // The common error substring
  occurrences: number;   // How many tasks hit this
  task_ids: string[];    // Which tasks
}
