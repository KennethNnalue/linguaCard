export interface DataRefresher {
  readonly name: string;
  refresh(userId: string): Promise<void>;
}
