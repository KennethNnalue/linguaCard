export interface SyncHandler {
  readonly type: string;
  execute(payload: unknown): Promise<void>;
}
