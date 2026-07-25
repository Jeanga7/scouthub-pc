declare module "pg" {
  export interface QueryResultRow {
    [column: string]: unknown;
  }

  export interface QueryResult<TRow extends QueryResultRow = QueryResultRow> {
    readonly rows: TRow[];
  }

  export class Pool {
    constructor(options: { connectionString: string; max?: number });
    query<TRow extends QueryResultRow = QueryResultRow>(
      text: string,
      values?: readonly unknown[]
    ): Promise<QueryResult<TRow>>;
    end(): Promise<void>;
  }

  const pg: {
    readonly Pool: typeof Pool;
  };

  export default pg;
}
