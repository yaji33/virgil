import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  DatabaseSchema,
  emptyDatabase,
  type Database,
} from "./schema.js";

export class RecordStore {
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

  transaction<T>(fn: (db: Database) => T): Promise<T> {
    const run = this.chain.then(async () => {
      const draft = structuredClone(this.data);
      const result = fn(draft);
      this.data = DatabaseSchema.parse(draft);
      await this.persist();
      return result;
    });
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async persist(): Promise<void> {
    if (!this.filePath) return;
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(this.data, null, 2)}\n`);
  }
}
