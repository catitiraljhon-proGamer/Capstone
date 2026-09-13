import { MongoClient, ServerApiVersion, type Db } from "mongodb";

const globalForMongo = globalThis as typeof globalThis & {
  mongoClientPromise?: Promise<MongoClient>;
  mongoIndexesPromise?: Promise<void>;
};

function getMongoConfig() {
  const uri = process.env.MONGODB_URI;
  const databaseName = process.env.MONGODB_DB;

  if (!uri) {
    throw new Error("MONGODB_URI is not configured.");
  }

  if (!databaseName) {
    throw new Error("MONGODB_DB is not configured.");
  }

  return { uri, databaseName };
}

function getClientPromise() {
  if (!globalForMongo.mongoClientPromise) {
    const { uri } = getMongoConfig();
    const client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    });

    globalForMongo.mongoClientPromise = client.connect();
  }

  return globalForMongo.mongoClientPromise;
}

async function ensureIndexes(db: Db) {
  if (!globalForMongo.mongoIndexesPromise) {
    globalForMongo.mongoIndexesPromise = Promise.all([
      db.collection("users").createIndex({ email: 1 }, { unique: true }),
      db.collection("users").createIndex(
        { googleSub: 1 },
        { unique: true, partialFilterExpression: { googleSub: { $type: "string" } } },
      ),
      db.collection("house_designs").createIndex({ houseType: 1, status: 1 }),
      db.collection("house_designs").createIndex({ name: 1 }, { unique: true }),
      db.collection("house_types").createIndex({ heading: 1 }, { unique: true }),
      db.collection("exterior_items").createIndex({ item: 1 }, { unique: true }),
      db
        .collection("reference_values")
        .createIndex({ category: 1, value: 1 }, { unique: true }),
      db.collection("messages").createIndex({ conversationKey: 1, createdAt: 1 }),
      db.collection("messages").createIndex({ customerId: 1, createdAt: -1 }),
      db
        .collection("messages")
        .createIndex({ recipientRole: 1, customerId: 1, createdAt: -1 }),
      db
        .collection("messages")
        .createIndex({
          recipientRole: 1,
          authorRole: 1,
          readByStaffIds: 1,
          createdAt: -1,
        }),
      db.collection("projects").createIndex({ reference: 1 }, { unique: true }),
      db.collection("projects").createIndex({ customerId: 1, status: 1 }),
      db.collection("design_requests").createIndex({ customerId: 1, createdAt: -1 }),
      db.collection("cost_estimates").createIndex({ reference: 1 }, { unique: true }),
      db.collection("approvals").createIndex({ status: 1, createdAt: -1 }),
      db
        .collection("approvals")
        .createIndex({ recordType: 1, recordId: 1 }, { unique: true }),
      db.collection("invoices").createIndex({ invoiceNumber: 1 }, { unique: true }),
      db.collection("invoices").createIndex({ customerId: 1, status: 1 }),
      db.collection("payments").createIndex({ reference: 1 }, { unique: true }),
      db.collection("payments").createIndex({ customerId: 1, status: 1 }),
      db.collection("documents").createIndex({ customerId: 1, createdAt: -1 }),
      db.collection("notifications").createIndex({ userId: 1, readAt: 1, createdAt: -1 }),
      db.collection("schedules").createIndex({ scheduledFor: 1, status: 1 }),
      db.collection("schedules").createIndex({ clientId: 1, scheduledFor: -1 }),
      db.collection("audit_logs").createIndex({ createdAt: -1 }),
      db.collection("audit_logs").createIndex({ action: 1, createdAt: -1 }),
      db.collection("audit_logs").createIndex({ entityType: 1, createdAt: -1 }),
      db.collection("audit_logs").createIndex({ actorId: 1, createdAt: -1 }),
    ]).then(() => undefined);
  }

  await globalForMongo.mongoIndexesPromise;
}

export async function getDatabase() {
  const { databaseName } = getMongoConfig();
  const client = await getClientPromise();
  const db = client.db(databaseName);
  await ensureIndexes(db);
  return db;
}
