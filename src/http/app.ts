import { WorkspaceBoundary } from "../boundary/workspace.js";
import { RecordStore } from "../records/store.js";

export async function createBoundary(): Promise<WorkspaceBoundary> {
  const store =
    process.env.VIRGIL_STORE === "memory"
      ? RecordStore.memory()
      : await RecordStore.open(
          process.env.VIRGIL_DATA ?? "data/workspace.json",
        );
  return new WorkspaceBoundary(store);
}
