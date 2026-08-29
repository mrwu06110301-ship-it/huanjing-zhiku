/** AI 知识库管理 API（仅管理员） */

import request from "./request";

export interface KBRun {
  id: number;
  started_at: string;
  finished_at: string | null;
  mode: string;
  trigger_type: string;
  status: string;
  chunks_changed: number | null;
  total_chunks: number | null;
  message: string | null;
}

export interface KBStatus {
  chunks: number;
  fts: number;
  pdf_files: number;
  lock_held: boolean;
  lock_since: string | null;
  schedule: {
    description: string;
    cron: string;
    command: string;
    log_file: string;
  };
  last_run: KBRun | null;
}

export function getKBStatus(): Promise<{ data: KBStatus }> {
  return request.get("/admin/kb/status");
}

export function getKBHistory(): Promise<{ data: KBRun[] }> {
  return request.get("/admin/kb/history");
}

export function triggerKBRebuild(): Promise<{ data: { message: string; pid: number } }> {
  return request.post("/admin/kb/rebuild");
}

export function getKBRunning(): Promise<{ data: { running: boolean; started_at: string | null } }> {
  return request.get("/admin/kb/running");
}
