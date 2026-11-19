// Only used when bundling for Workers. The durable-object driver must always be injected.
export class DatabaseSync {
  constructor() { throw Error('A Durable Object SQLite driver is required.'); }
}
