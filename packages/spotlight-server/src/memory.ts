import { InMemoryStore, MemorySaver } from "@langchain/langgraph";
import {
  PostgresSaver,
} from "@langchain/langgraph-checkpoint-postgres";
import { PostgresStore } from "@langchain/langgraph-checkpoint-postgres/store";

export interface SpotlightMemoryRuntime {
  checkpointer: MemorySaver | PostgresSaver;
  store: InMemoryStore | PostgresStore;
  setup(): Promise<void>;
}

export function createMemoryRuntime(databaseUrl?: string): SpotlightMemoryRuntime {
  if (!databaseUrl) {
    return {
      checkpointer: new MemorySaver(),
      store: new InMemoryStore(),
      async setup() {},
    };
  }
  const checkpointer = PostgresSaver.fromConnString(databaseUrl);
  const store = PostgresStore.fromConnString(databaseUrl);
  return {
    checkpointer,
    store,
    async setup() {
      await checkpointer.setup();
      await store.setup();
    },
  };
}
