import { hash } from "bcryptjs";
import { readFile } from "node:fs/promises";
import { MongoClient, ObjectId, ServerApiVersion } from "mongodb";

try {
  if (typeof process.loadEnvFile === "function") {
    process.loadEnvFile(".env.local");
  } else {
    const envFile = await readFile(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of envFile.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^("|')|("|')$/g, "");
    }
  }
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

const loadJson = async (name) =>
  JSON.parse(await readFile(new URL(`../database/seeds/${name}`, import.meta.url), "utf8"));

const optionalAccount = (prefix, role) => {
  const name = process.env[`SEED_${prefix}_NAME`]?.trim();
  const email = process.env[`SEED_${prefix}_EMAIL`]?.trim().toLowerCase();
  const password = process.env[`SEED_${prefix}_PASSWORD`];
  const supplied = [name, email, password].filter(Boolean).length;

  if (supplied === 0) return null;
  if (supplied !== 3) {
    throw new Error(`Supply NAME, EMAIL, and PASSWORD for the ${prefix.toLowerCase()} seed account.`);
  }

  return { name, email, password, role };
};

const uri = required("MONGODB_URI");
const databaseName = required("MONGODB_DB");
const accounts = [
  {
    name: required("SEED_ADMIN_NAME"),
    email: required("SEED_ADMIN_EMAIL").toLowerCase(),
    password: required("SEED_ADMIN_PASSWORD"),
    role: "admin",
  },
  optionalAccount("CLERK", "billing-clerk"),
  optionalAccount("CUSTOMER", "customer"),
].filter(Boolean);

for (const account of accounts) {
  if (account.password.length < 8) {
    throw new Error(`The seed password for ${account.email} must be at least 8 characters.`);
  }
}

const [houseTypes, exteriorItems, houseDesigns] = await Promise.all([
  loadJson("house-types.json"),
  loadJson("exterior-items.json"),
  loadJson("house-designs.json"),
]);

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

try {
  await client.connect();
  const db = client.db(databaseName);
  const now = new Date();

  for (const account of accounts) {
    const passwordHash = await hash(account.password, 12);
    await db.collection("users").updateOne(
      { email: account.email },
      {
        $set: {
          name: account.name,
          passwordHash,
          role: account.role,
          status: "active",
          updatedAt: now,
        },
        $setOnInsert: { _id: new ObjectId(), authVersion: 0, createdAt: now },
      },
      { upsert: true },
    );
  }

  const admin = await db.collection("users").findOne({ role: "admin", status: "active" });
  if (!admin) throw new Error("The admin seed account was not created.");

  await db.collection("reference_values").bulkWrite(
    ["Standard", "Semi-luxury", "Luxury"].map((value, order) => ({
      updateOne: {
        filter: { category: "house-design-finish", value },
        update: { $set: { order, active: true } },
        upsert: true,
      },
    })),
  );

  await db.collection("house_types").bulkWrite(
    houseTypes.map((houseType, order) => ({
      updateOne: {
        filter: { heading: houseType.heading },
        update: { $set: { ...houseType, order, active: true } },
        upsert: true,
      },
    })),
  );

  await db.collection("exterior_items").bulkWrite(
    exteriorItems.map((item, order) => ({
      updateOne: {
        filter: { item: item.item },
        update: { $set: { ...item, order, active: true } },
        upsert: true,
      },
    })),
  );

  await db.collection("house_designs").bulkWrite(
    houseDesigns.map((design) => ({
      updateOne: {
        filter: { name: design.name },
        update: {
          $set: { ...design, createdByName: admin.name, updatedAt: now },
          $setOnInsert: {
            _id: new ObjectId(),
            createdAt: now,
            createdBy: admin._id,
          },
        },
        upsert: true,
      },
    })),
  );

  console.log(
    `Seeded ${accounts.length} user(s), ${houseTypes.length} house types, ${exteriorItems.length} exterior items, and ${houseDesigns.length} house designs into ${databaseName}.`,
  );
} finally {
  await client.close();
}
