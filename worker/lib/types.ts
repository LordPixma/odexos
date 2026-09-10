import type { Db } from "../db/client";
import type { UserRow } from "../db/schema";

export interface Bindings {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_NAME: string;
}

export interface Variables {
  db: Db;
  user: UserRow;
}

export interface AppEnv {
  Bindings: Bindings;
  Variables: Variables;
}
