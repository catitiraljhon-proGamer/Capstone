import { MongoClient } from "mongodb";

// Direct connection is necessary before the single-node replica set is initialized.
const client = new MongoClient("mongodb://127.0.0.1:27017/?directConnection=true", { serverSelectionTimeoutMS: 1500 });
try {
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try { await client.connect(); ready = true; break; }
    catch { await new Promise((resolve) => setTimeout(resolve, 500)); }
  }
  if (!ready) throw new Error("Local MongoDB did not start on port 27017.");
  const admin = client.db("admin");
  try { await admin.command({ replSetGetStatus: 1 }); }
  catch (error) {
    if (error.code === 94) {
      await admin.command({ replSetInitiate: { _id: "g4-local", members: [{ _id: 0, host: "127.0.0.1:27017" }] } });
    } else {
      throw new Error("The MongoDB process on port 27017 is not configured as a replica set. Stop that local process and run npm run db:local again.", { cause: error });
    }
  }
  for (let attempt = 0; attempt < 60; attempt++) {
    const hello = await admin.command({ hello: 1 });
    if (hello.isWritablePrimary) { console.log("Local MongoDB replica set is ready for billing transactions."); ready = true; break; }
    ready = false;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error("MongoDB did not elect a writable primary.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally { await client.close(); }
