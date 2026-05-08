export interface WorkerSession {
  worker_id: string;
  session_token: string;
  login_at: string;
}

export interface WorkerSessionRepository {
  save(session: WorkerSession): Promise<void>;
}
