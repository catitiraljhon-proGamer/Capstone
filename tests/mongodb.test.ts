import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { MongoClient, type Db } from "mongodb";
import { getDatabase } from "@/lib/database/mongodb";

const cache = globalThis as typeof globalThis & {
  mongoClientPromise?: Promise<MongoClient>;
  mongoIndexesPromise?: Promise<void>;
};

beforeEach(() => {
  // Driver calls are mocked; these tests never connect to an external database.
  process.env.MONGODB_URI = "mongodb://127.0.0.1:27017";
  process.env.MONGODB_DB = "connection_recovery_tests";
  cache.mongoClientPromise = undefined;
  cache.mongoIndexesPromise = undefined;
});

afterEach(() => {
  mock.restoreAll();
  cache.mongoClientPromise = undefined;
  cache.mongoIndexesPromise = undefined;
});

function mockDatabase(createIndex: () => Promise<string>) {
  const db = { collection: () => ({ createIndex }) } as unknown as Db;
  mock.method(MongoClient.prototype, "db", () => db);
  return db;
}

test("a failed connection is shared by concurrent requests, then a later request reconnects", async () => {
  const failure = new Error("temporary connection failure");
  let attempts = 0;
  const clients: MongoClient[] = [];
  mock.method(MongoClient.prototype, "connect", async function (this: MongoClient) {
    clients.push(this);
    if (++attempts === 1) throw failure;
    return this;
  });
  const close = mock.method(MongoClient.prototype, "close", async () => {});
  const db = mockDatabase(async () => "index");

  const failures = await Promise.allSettled([getDatabase(), getDatabase()]);
  assert.equal(attempts, 1);
  for (const result of failures) {
    assert.equal(result.status, "rejected");
    if (result.status === "rejected") assert.equal(result.reason, failure);
  }
  assert.equal(close.mock.callCount(), 1);
  assert.equal(close.mock.calls[0].this, clients[0]);

  const recovered = await Promise.all([getDatabase(), getDatabase()]);
  assert.deepEqual(recovered, [db, db]);
  assert.equal(attempts, 2);
  assert.notEqual(clients[0], clients[1]);
  await getDatabase();
  assert.equal(attempts, 2);
});

test("a failed index initialization retries without replacing the healthy connection", async () => {
  const connect = mock.method(
    MongoClient.prototype,
    "connect",
    async function (this: MongoClient) { return this; },
  );
  const close = mock.method(MongoClient.prototype, "close", async () => {});
  const failure = new Error("temporary index failure");
  let unavailable = true;
  let indexCalls = 0;
  const db = mockDatabase(async () => {
    indexCalls++;
    if (unavailable) throw failure;
    return "index";
  });

  await assert.rejects(getDatabase(), (error) => error === failure);
  const firstIndexCalls = indexCalls;
  assert.ok(firstIndexCalls > 0);
  unavailable = false;
  assert.deepEqual(await Promise.all([getDatabase(), getDatabase()]), [db, db]);
  assert.equal(indexCalls, firstIndexCalls * 2);
  assert.equal(connect.mock.callCount(), 1);
  assert.equal(close.mock.callCount(), 0);
  await getDatabase();
  assert.equal(indexCalls, firstIndexCalls * 2);
});
