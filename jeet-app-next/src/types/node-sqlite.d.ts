// Runtime is Node 24. The workspace still uses Node 20 declarations.
declare module "node:sqlite" {
  type Input = string | number | bigint | null | Uint8Array;
  type Output = Record<string, Input>;
  export class DatabaseSync {
    constructor(path: string);
    close(): void;
    exec(sql: string): void;
    prepare(sql: string): {
      get(...params: Input[]): Output | undefined;
      all(...params: Input[]): Output[];
      iterate(...params: Input[]): IterableIterator<Output>;
      run(...params: Input[]): { changes: number | bigint; lastInsertRowid: number | bigint };
    };
  }
}
