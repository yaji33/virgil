import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { assertImmutableRecords } from "./immutable.js";
import { dirname } from "node:path";
import {
  DatabaseSchema,
  emptyDatabase,
  type Database,
} from "./schema.js";

export interface Records {
  transaction<T>(fn: (db: Database) => T, scope?: RecordScope): Promise<T>;
  close(): Promise<void>;
}

export type RecordScope =
  | { tokenHash: string }
  | { userId: string }
  | { workspaceId: string };

export class RecordStore implements Records {
  private data: Database;
  private chain = Promise.resolve();

  private constructor(
    private readonly filePath: string | undefined,
    data: Database,
  ) {
    this.data = data;
  }

  static memory(): RecordStore {
    return new RecordStore(undefined, emptyDatabase());
  }

  static async open(filePath: string): Promise<RecordStore> {
    try {
      const raw = await readFile(filePath, "utf8");
      return new RecordStore(filePath, DatabaseSchema.parse(JSON.parse(raw)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return new RecordStore(filePath, emptyDatabase());
      }
      throw error;
    }
  }

  snapshot(): Database {
    return structuredClone(this.data);
  }

  close(): Promise<void> {
    return Promise.resolve();
  }

  transaction<T>(fn: (db: Database) => T, _scope?: RecordScope): Promise<T> {
    const run = this.chain.then(async () => {
      const draft = structuredClone(this.data);
      const result = fn(draft);
      const validated = DatabaseSchema.parse(draft);
      assertImmutableRecords(this.data, validated);
      await this.persist(validated);
      this.data = validated;
      return structuredClone(result);
    });
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async persist(data: Database): Promise<void> {
    if (!this.filePath) return;
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`);
    await rename(temporary, this.filePath);
  }
}
