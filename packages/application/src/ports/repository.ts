export interface TransactionContext {
  readonly transactionId: string;
}

export interface BaseRepository<TEntity, TId extends string> {
  findById(id: TId, context?: TransactionContext): Promise<TEntity | null>;
  save(entity: TEntity, context?: TransactionContext): Promise<void>;
}
