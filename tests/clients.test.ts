import assert from "node:assert/strict";
import { after, before, beforeEach, mock, test } from "node:test";
import { compare } from "bcryptjs";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { type Db, type MongoClient, ObjectId } from "mongodb";
import { accountTerms } from "@/lib/account-terms";
import { getDatabase } from "@/lib/database/mongodb";
import { type UserDocument } from "@/lib/database/collections";
import { clientProfileSchema, ClientRequestError, createClient, getClient, listClients, setClientArchived, toClientDto, updateClient } from "@/lib/server/clients";
import { assertClientMutation, clientApiError } from "@/lib/server/client-api";
import type { SessionUser } from "@/types/domain";
import { POST as registerCustomer } from "@/app/api/auth/register/route";
import { POST as sendVerificationCode } from "@/app/api/auth/register/send-code/route";
import { issueEmailVerificationCode } from "@/lib/server/email-verification";
import { sessionCookieName } from "@/lib/server/session";
import { phContactNumberError, sanitizePhContactNumberInput } from "@/lib/ph-contact-number";

let mongo: MongoMemoryReplSet;
let db: Db;
const admin: SessionUser = { id: new ObjectId().toHexString(), name: "Test Admin", email: "admin@example.test", role: "admin" };
// Real PSGC codes: Barangay Baclaran, Balayan, Batangas.
const addressInput = { provinceCode: "0401000000", cityCode: "0401003000", barangayCode: "0401003001", barangay: "Baclaran", street: "123 Example Street", postalCode: "4213" };
const storedAddressDetails = { ...addressInput, province: "Batangas", city: "Balayan" };
const formattedAddress = "123 Example Street, Brgy. Baclaran, Balayan, Batangas 4213";
const details = { name: "Test Client", contactNumber: "+63 917 123 4567", addressDetails: addressInput, occupation: "Engineer" };
const password = "Test-password-2026";
const registrationInput = { ...details, email: "new.client@gmail.com", password };
// Issued fresh for registrationInput.email before every test.
let verificationCode = "";

function registrationRequest(input: unknown) {
  return new Request("http://localhost:3000/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ verificationCode, termsVersion: accountTerms.version, ...(input as object) }),
  });
}

function sendCodeRequest(email: string, ip = "203.0.113.10") {
  return new Request("http://localhost:3000/api/auth/register/send-code", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-real-ip": ip },
    body: JSON.stringify({ email }),
  });
}

function legacyUser(overrides: Partial<UserDocument> = {}): UserDocument {
  return { _id: new ObjectId(), name: "Existing Client", email: "existing@example.test", role: "customer", status: "active", authVersion: 4, passwordHash: "existing-hash", googleSub: new ObjectId().toHexString(), createdAt: new Date(), updatedAt: new Date(), ...overrides };
}

before(async () => {
  process.env.AUTH_SECRET = "isolated-client-test-secret-at-least-32-characters";
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  process.env.MONGODB_URI = mongo.getUri();
  process.env.MONGODB_DB = "isolated_client_tests";
  db = await getDatabase();
});
beforeEach(async () => {
  await Promise.all(["users", "audit_logs", "notifications", "projects", "invoices", "rate_limits", "email_verifications"].map((name) => db.collection(name).deleteMany({})));
  verificationCode = await issueEmailVerificationCode(db, registrationInput.email);
});
after(async () => {
  const cache = globalThis as typeof globalThis & { mongoClientPromise?: Promise<MongoClient> };
  await (await cache.mongoClientPromise)?.close();
  await mongo?.stop();
});

const invalidPhoneNumbers = ["+1 415 555 0100", "0917 123 456", "0917 123 45678", "+63 917 123 456", "+63 817 123 4567", "9171234567", "(0917) 123 4567", "0917abc4567", "02 8123 4567"];

test("contact numbers must be Philippine mobile numbers and are saved in one format", () => {
  for (const contactNumber of ["09171234567", "0917 123 4567", "0917-123-4567", "+639171234567", "+63 917 123 4567", "+63-917-123-4567"]) {
    assert.equal(clientProfileSchema.parse({ ...details, contactNumber }).contactNumber, "+63 917 123 4567", contactNumber);
  }
  for (const contactNumber of invalidPhoneNumbers) {
    assert.ok(phContactNumberError(contactNumber), contactNumber);
  }
  assert.match(phContactNumberError("0917 123 456")!, /11 digits \(you entered 10\)/);
  assert.match(phContactNumberError("+1 415 555 0100")!, /Philippine/);
  assert.equal(sanitizePhContactNumberInput("+63 917abc123!4567"), "+63 9171234567");
  // Digits stop at a full number: 11 for 09…, 12 (63 + 10) for +63….
  assert.equal(sanitizePhContactNumberInput("090513350699999"), "09051335069");
  assert.equal(sanitizePhContactNumberInput("0905 133 5069 999"), "0905 133 5069 ");
  assert.equal(sanitizePhContactNumberInput("+639051335069999"), "+639051335069");
  assert.equal(sanitizePhContactNumberInput("+63 905 133 5069 9"), "+63 905 133 5069");
  assert.equal(sanitizePhContactNumberInput("0917 "), "0917 ");
});

test("validates required contact details and overposted account fields", () => {
  assert.equal(clientProfileSchema.parse({ ...details, occupation: "  " }).occupation, "");
  for (const change of [{ age: 35 }, { contactNumber: "abcdefg" }, { contactNumber: "123--456" }, { contactNumber: "1".repeat(16) }, ...invalidPhoneNumbers.map((contactNumber) => ({ contactNumber })), { addressDetails: { ...addressInput, street: "   " } }, { addressDetails: { ...addressInput, postalCode: "421" } }, { addressDetails: { ...addressInput, cityCode: "0401014000" } }, { addressDetails: { ...addressInput, provinceCode: "1300000000" } }, { address: "Free text address" }, { name: " " }, { role: "admin" }, { email: "changed@example.test" }, { passwordHash: "injected" }]) {
    assert.equal(clientProfileSchema.safeParse({ ...details, ...change }).success, false, JSON.stringify(change));
  }
});

test("existing users remain readable with incomplete information and no exposed credentials", () => {
  const dto = toClientDto(legacyUser());
  assert.equal(dto.contactNumber, "");
  assert.equal(dto.profileComplete, false);
  for (const key of ["passwordHash", "googleSub", "authVersion"]) assert.equal(key in dto, false);
});

test("admin creates a customer account with hashed password and saved client information", async () => {
  const dto = await createClient(db, admin, { ...details, email: "  NEW.CLIENT@GMAIL.COM  ", password });
  const saved = await db.collection<UserDocument>("users").findOne({ _id: new ObjectId(dto.id) });
  assert.ok(saved);
  assert.equal(saved.email, "new.client@gmail.com");
  assert.equal(saved.role, "customer");
  assert.equal(saved.status, "active");
  assert.equal(await compare(password, saved.passwordHash!), true);
  assert.equal(saved.clientDetails?.contactNumber, details.contactNumber);
  assert.equal(dto.profileComplete, true);
  assert.equal("passwordHash" in dto, false);
  const audit = await db.collection("audit_logs").findOne({ action: "client.created" });
  assert.ok(audit);
  assert.equal(JSON.stringify(audit).includes(password), false);
});

test("customer registration saves a complete record visible in the Client Module and customer profile", async () => {
  await db.collection<UserDocument>("users").insertOne(legacyUser({
    _id: new ObjectId(admin.id), name: admin.name, email: admin.email, role: "admin",
  }));
  // The Terms and Conditions pop-up must be agreed to before an account is created.
  for (const termsVersion of [undefined, "1999-01-01"]) {
    assert.equal((await registerCustomer(registrationRequest({ ...registrationInput, termsVersion }))).status, 400);
  }
  assert.equal(await db.collection("users").countDocuments({ email: registrationInput.email }), 0);
  const response = await registerCustomer(registrationRequest({
    ...registrationInput, name: `  ${details.name}  `, email: "  NEW.CLIENT@GMAIL.COM  ",
    contactNumber: `  ${details.contactNumber}  `, addressDetails: { ...addressInput, street: `  ${addressInput.street}  ` },
    occupation: `  ${details.occupation}  `,
  }));
  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.equal(payload.redirectTo, "/customer");
  assert.ok(response.cookies.get(sessionCookieName)?.value);
  const saved = await db.collection<UserDocument>("users").findOne({ email: registrationInput.email });
  assert.ok(saved);
  assert.equal(saved.role, "customer");
  assert.equal(saved.status, "active");
  assert.equal(saved.termsAcceptance?.version, accountTerms.version);
  assert.equal(await db.collection("audit_logs").countDocuments({ action: "account.terms-accepted", actorId: saved._id }), 1);
  assert.equal(await compare(password, saved.passwordHash!), true);
  assert.deepEqual(saved.clientDetails, {
    contactNumber: details.contactNumber, address: formattedAddress, occupation: details.occupation,
    addressDetails: storedAddressDetails,
  });
  const listed = await listClients(db, admin, { q: registrationInput.email });
  assert.equal(listed.total, 1);
  const [client] = listed.clients;
  assert.equal(client.id, payload.user.id);
  assert.equal(client.name, details.name);
  assert.equal(client.email, registrationInput.email);
  assert.equal(client.profileComplete, true);
  assert.deepEqual(await getClient(db, payload.user, client.id), client);
  for (const key of ["password", "passwordHash", "googleSub", "authVersion"]) {
    assert.equal(key in client, false);
    assert.equal(key in payload.user, false);
  }
  const notification = await db.collection("notifications").findOne({ userId: new ObjectId(admin.id) });
  assert.equal(notification?.href, "/admin/clients");
  assert.equal(notification?.entityId.toHexString(), client.id);
  const audit = await db.collection("audit_logs").findOne({ action: "auth.registered" });
  assert.ok(audit);
  assert.equal(JSON.stringify(audit).includes(password), false);
});

test("registration permits an omitted occupation", async () => {
  const response = await registerCustomer(registrationRequest({ ...registrationInput, occupation: undefined }));
  assert.equal(response.status, 201);
  const { clients } = await listClients(db, admin, {});
  assert.equal(clients[0].occupation, "");
  assert.equal(clients[0].profileComplete, true);
});

test("registration rejects incomplete or invalid client details and injected account fields before creating an account", async () => {
  const invalidChanges = [
    { age: 35 },
    { contactNumber: undefined }, { contactNumber: "abcdefg" }, { contactNumber: "123--456" }, { contactNumber: "+1 415 555 0100" }, { contactNumber: "0917 123 456" },
    { addressDetails: undefined }, { addressDetails: { ...addressInput, street: "   " } }, { addressDetails: { ...addressInput, barangayCode: "0401014001" } }, { occupation: "a".repeat(101) },
    { role: "admin" }, { status: "disabled" }, { passwordHash: "injected" },
  ];
  for (const change of invalidChanges) {
    const response = await registerCustomer(registrationRequest({ ...registrationInput, ...change }));
    assert.equal(response.status, 400, JSON.stringify(change));
    assert.equal(response.cookies.get(sessionCookieName), undefined);
    assert.ok((await response.json()).issues.length);
  }
  assert.equal(await db.collection("users").countDocuments(), 0);
  assert.equal(await db.collection("notifications").countDocuments(), 0);
  assert.equal(await db.collection("audit_logs").countDocuments(), 0);
});

test("duplicate registration cannot duplicate or overwrite a client record", async () => {
  assert.equal((await registerCustomer(registrationRequest(registrationInput))).status, 201);
  const response = await registerCustomer(registrationRequest({
    ...registrationInput, email: "  NEW.CLIENT@GMAIL.COM  ", name: "Replacement Name", addressDetails: { ...addressInput, street: "Replacement Street" },
  }));
  assert.equal(response.status, 409);
  assert.equal(response.cookies.get(sessionCookieName), undefined);
  const listed = await listClients(db, admin, {});
  assert.equal(listed.total, 1);
  assert.equal(listed.clients[0].name, details.name);
  assert.equal(listed.clients[0].address, formattedAddress);
  assert.equal(await db.collection("audit_logs").countDocuments({ action: "auth.registered" }), 1);
});

test("simultaneous registrations with the same email create only one client", async () => {
  const responses = await Promise.all([
    registerCustomer(registrationRequest(registrationInput)),
    registerCustomer(registrationRequest(registrationInput)),
  ]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
  assert.equal((await listClients(db, admin, {})).total, 1);
});

test("registration requires the latest unexpired code sent to that email address", async () => {
  for (const code of [undefined, "12345", "abcdef"]) {
    const response = await registerCustomer(registrationRequest({ ...registrationInput, verificationCode: code }));
    assert.equal(response.status, 400, String(code));
  }
  const wrongCode = verificationCode === "000000" ? "111111" : "000000";
  const wrong = await registerCustomer(registrationRequest({ ...registrationInput, verificationCode: wrongCode }));
  assert.equal(wrong.status, 400);
  assert.match((await wrong.json()).error, /incorrect/);
  // A code sent to one address cannot register a different, made-up address.
  const otherAddress = await registerCustomer(registrationRequest({ ...registrationInput, email: "made-up@gmail.com" }));
  assert.equal(otherAddress.status, 400);
  await db.collection<{ _id: string }>("email_verifications").updateOne(
    { _id: registrationInput.email }, { $set: { expiresAt: new Date(Date.now() - 1000) } },
  );
  const expired = await registerCustomer(registrationRequest(registrationInput));
  assert.equal(expired.status, 400);
  assert.match((await expired.json()).error, /expired/);
  assert.equal(await db.collection("users").countDocuments(), 0);
  assert.equal(await db.collection("audit_logs").countDocuments(), 0);
});

test("a verification code stops working after five wrong attempts", async () => {
  const wrongCode = verificationCode === "000000" ? "111111" : "000000";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal((await registerCustomer(registrationRequest({ ...registrationInput, verificationCode: wrongCode }))).status, 400);
  }
  const response = await registerCustomer(registrationRequest(registrationInput));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /too many times/);
  assert.equal(await db.collection("users").countDocuments(), 0);
});

test("self-registration accepts only Gmail addresses", async () => {
  for (const email of ["someone@example.com", "someone@yahoo.com", "someone@gmail.co", "someone@mail.gmail.com"]) {
    const sent = await sendVerificationCode(sendCodeRequest(email));
    assert.equal(sent.status, 400, email);
    assert.match((await sent.json()).error, /@gmail\.com/);
    assert.equal((await registerCustomer(registrationRequest({ ...registrationInput, email }))).status, 400, email);
  }
  assert.equal(await db.collection<{ _id: string }>("email_verifications").countDocuments({ _id: { $ne: registrationInput.email } }), 0);
  assert.equal(await db.collection("users").countDocuments(), 0);
});

test("verification codes go only to addresses without an account, at most once a minute, and are stored hashed", async () => {
  const logged: string[] = [];
  mock.method(console, "info", (message: string) => logged.push(message));
  try {
    const sent = await sendVerificationCode(sendCodeRequest("  Fresh@Gmail.COM "));
    assert.equal(sent.status, 200);
    const code = logged.at(-1)?.match(/fresh@gmail\.com: (\d{6})$/)?.[1];
    assert.ok(code);
    const stored = await db.collection<{ _id: string }>("email_verifications").findOne({ _id: "fresh@gmail.com" });
    assert.ok(stored);
    assert.equal(JSON.stringify(stored).includes(code), false);

    const tooSoon = await sendVerificationCode(sendCodeRequest("fresh@gmail.com"));
    assert.equal(tooSoon.status, 429);
    assert.ok((await tooSoon.json()).retryAfterSeconds > 0);

    await db.collection<UserDocument>("users").insertOne(legacyUser({ email: "taken@gmail.com" }));
    assert.equal((await sendVerificationCode(sendCodeRequest("taken@gmail.com"))).status, 409);
    assert.equal((await sendVerificationCode(sendCodeRequest("not-an-email"))).status, 400);

    const registered = await registerCustomer(registrationRequest({ ...registrationInput, email: "fresh@gmail.com", verificationCode: code }));
    assert.equal(registered.status, 201);
  } finally {
    mock.restoreAll();
  }
});

test("one address cannot be flooded with verification emails from many networks", async () => {
  const realNow = Date.now();
  mock.method(console, "info", () => undefined);
  try {
    for (let request = 0; request < 5; request += 1) {
      // Step past the one-minute resend wait each time.
      await db.collection<{ _id: string }>("email_verifications").updateOne(
        { _id: "inbox@gmail.com" }, { $set: { sentAt: new Date(realNow - 120_000) } },
      );
      assert.equal((await sendVerificationCode(sendCodeRequest("inbox@gmail.com", `198.51.100.${request}`))).status, 200);
    }
    await db.collection<{ _id: string }>("email_verifications").updateOne(
      { _id: "inbox@gmail.com" }, { $set: { sentAt: new Date(realNow - 120_000) } },
    );
    assert.equal((await sendVerificationCode(sendCodeRequest("inbox@gmail.com", "198.51.100.99"))).status, 429);
  } finally {
    mock.restoreAll();
  }
});

test("customer updates only their profile and the administrator reads the same saved record", async () => {
  const original = legacyUser();
  await db.collection<UserDocument>("users").insertOne(original);
  const actor: SessionUser = { id: original._id.toHexString(), name: original.name, email: original.email, role: "customer" };
  // The administrator reads client details but cannot change them; clients edit their own in My Profile.
  await assert.rejects(updateClient(db, admin, actor.id, details), (error: unknown) => error instanceof ClientRequestError && error.status === 403);
  assert.equal((await db.collection<UserDocument>("users").findOne({ _id: original._id }))?.name, original.name);
  await updateClient(db, actor, actor.id, details);
  const dto = await getClient(db, admin, actor.id);
  assert.equal(dto.name, details.name);
  assert.equal(dto.profileComplete, true);
  const saved = await db.collection<UserDocument>("users").findOne({ _id: original._id });
  for (const field of ["email", "role", "status", "googleSub", "passwordHash", "authVersion"] as const) assert.equal(saved?.[field], original[field]);
  assert.equal(await db.collection("users").countDocuments(), 1);
  const audit = await db.collection("audit_logs").findOne({ action: "client.updated" });
  assert.ok(audit);
  assert.equal(JSON.stringify(audit).includes(formattedAddress), false);
  assert.equal(JSON.stringify(audit).includes(details.contactNumber), false);
});

test("customers and billing clerks cannot list, create, read, or edit other clients", async () => {
  const record = legacyUser();
  await db.collection<UserDocument>("users").insertOne(record);
  for (const role of ["customer", "billing-clerk"] as const) {
    const actor = { ...admin, role };
    const denied = (error: unknown) => error instanceof ClientRequestError && error.status === 403;
    await assert.rejects(listClients(db, actor, {}), denied);
    await assert.rejects(createClient(db, actor, { ...details, email: "unauthorized@example.test", password }), denied);
    await assert.rejects(getClient(db, actor, record._id.toHexString()), denied);
    await assert.rejects(updateClient(db, actor, record._id.toHexString(), details), denied);
  }
  assert.equal((await db.collection("users").findOne({ _id: record._id }))?.name, record.name);
  assert.equal(await db.collection("audit_logs").countDocuments(), 0);
});

test("client APIs cannot modify staff accounts, invalid ids, or unknown account fields", async () => {
  const staff = legacyUser({ role: "admin" });
  await db.collection<UserDocument>("users").insertOne(staff);
  await assert.rejects(updateClient(db, admin, staff._id.toHexString(), details), (error: unknown) => error instanceof ClientRequestError && error.status === 403);
  await assert.rejects(getClient(db, admin, "invalid-id"), (error: unknown) => error instanceof ClientRequestError && error.status === 400);
  await assert.rejects(updateClient(db, admin, new ObjectId().toHexString(), { ...details, role: "admin" }));
  assert.equal((await db.collection("users").findOne({ _id: staff._id }))?.name, staff.name);
});

test("client searches are literal, paginated, and exclude staff", async () => {
  await db.collection<UserDocument>("users").insertMany([
    legacyUser({ name: "Literal [.*]", email: "literal@example.test", clientDetails: { contactNumber: "09171234567", address: "Sample Address", occupation: "" } }),
    legacyUser({ email: "second@example.test" }),
    legacyUser({ email: "staff@example.test", role: "admin" }),
  ]);
  const result = await listClients(db, admin, { q: "[.*]", pageSize: 1 });
  assert.equal(result.total, 1);
  assert.equal(result.clients[0].name, "Literal [.*]");
  assert.equal((await listClients(db, admin, { q: "0917" })).total, 1);
  assert.equal((await listClients(db, admin, { q: "Sample Address" })).total, 1);
  const finalPage = await listClients(db, admin, { page: 50, pageSize: 1 });
  assert.equal(finalPage.page, 2);
  assert.equal(finalPage.total, 2);
  assert.equal(finalPage.clients.length, 1);
});

test("duplicate account emails are rejected without another client record", async () => {
  const input = { ...details, email: "unique@example.test", password };
  await createClient(db, admin, input);
  try { await createClient(db, admin, input); assert.fail("Expected duplicate email error"); }
  catch (error) { assert.equal(clientApiError(error).status, 409); }
  assert.equal(await db.collection("users").countDocuments(), 1);
});

test("client writes reject cross-origin requests and non-JSON forms", () => {
  const url = "https://app.example/api/profile";
  assert.doesNotThrow(() => assertClientMutation(new Request(url, { method: "PATCH", headers: { origin: "https://app.example", "Content-Type": "application/json" } })));
  const invalidHeaders: Record<string, string>[] = [{ origin: "https://attacker.example", "Content-Type": "application/json" }, { "sec-fetch-site": "cross-site", "Content-Type": "application/json" }, { "Content-Type": "text/plain" }];
  for (const headers of invalidHeaders) {
    assert.throws(() => assertClientMutation(new Request(url, { method: "PATCH", headers })));
  }
});

test("archiving and unarchiving preserve client identity, account access, and project and billing records", async () => {
  const original = legacyUser({ clientDetails: { contactNumber: details.contactNumber, address: formattedAddress, occupation: details.occupation, addressDetails: storedAddressDetails } });
  await db.collection<UserDocument>("users").insertOne(original);
  const project = { _id: new ObjectId(), customerId: original._id, reference: "TEST-PROJECT" };
  const invoice = { _id: new ObjectId(), customerId: original._id, projectId: project._id, invoiceNumber: "TEST-INVOICE" };
  await db.collection("projects").insertOne(project);
  await db.collection("invoices").insertOne(invoice);
  const id = original._id.toHexString();

  const archived = await setClientArchived(db, admin, id, { archived: true });
  assert.ok(archived.archivedAt);
  assert.equal(archived.id, id);
  assert.equal((await listClients(db, admin, {})).total, 0);
  assert.equal((await listClients(db, admin, { view: "archived" })).clients[0].id, id);
  const customer: SessionUser = { id, name: original.name, email: original.email, role: "customer" };
  assert.equal((await getClient(db, customer, id)).id, id);
  await updateClient(db, customer, id, details);
  assert.equal((await getClient(db, admin, id)).archivedAt, archived.archivedAt);

  const restored = await setClientArchived(db, admin, id, { archived: false });
  assert.equal(restored.archivedAt, null);
  assert.equal((await listClients(db, admin, {})).clients[0].id, id);
  assert.equal((await listClients(db, admin, { view: "archived" })).total, 0);
  const saved = await db.collection<UserDocument>("users").findOne({ _id: original._id });
  for (const field of ["email", "role", "status", "googleSub", "passwordHash", "authVersion"] as const) assert.equal(saved?.[field], original[field]);
  assert.deepEqual(saved?.clientDetails, original.clientDetails);
  assert.deepEqual(await db.collection("projects").findOne({ _id: project._id }), project);
  assert.deepEqual(await db.collection("invoices").findOne({ _id: invoice._id }), invoice);
  assert.equal(await db.collection("users").countDocuments(), 1);
  for (const action of ["client.archived", "client.unarchived"]) {
    const audit = await db.collection("audit_logs").findOne({ action });
    assert.equal(audit?.actorId.toHexString(), admin.id);
    assert.equal(audit?.entityId.toHexString(), id);
    assert.equal(JSON.stringify(audit).includes(original.passwordHash!), false);
  }
});

test("archive filtering includes legacy clients and keeps search and pagination within the selected view", async () => {
  await db.collection<UserDocument>("users").insertMany([
    legacyUser({ name: "Current Client", email: "current@example.test" }),
    legacyUser({ name: "Null Archive Client", email: "null@example.test", clientArchivedAt: null }),
    legacyUser({ name: "Archived [.*]", email: "archived@example.test", clientArchivedAt: new Date() }),
    legacyUser({ name: "Other Archived", email: "other@example.test", clientArchivedAt: new Date() }),
    legacyUser({ email: "staff@example.test", role: "admin", clientArchivedAt: new Date() }),
  ]);
  assert.equal((await listClients(db, admin, {})).total, 2);
  assert.equal((await listClients(db, admin, { q: "Archived" })).total, 0);
  const searched = await listClients(db, admin, { view: "archived", q: "[.*]" });
  assert.equal(searched.total, 1);
  assert.equal(searched.clients[0].name, "Archived [.*]");
  const lastPage = await listClients(db, admin, { view: "archived", page: 50, pageSize: 1 });
  assert.equal(lastPage.total, 2);
  assert.equal(lastPage.page, 2);
  assert.equal(lastPage.clients.length, 1);
  await setClientArchived(db, admin, lastPage.clients[0].id, { archived: false });
  assert.equal((await listClients(db, admin, { view: "archived", page: 2, pageSize: 1 })).page, 1);
  await assert.rejects(listClients(db, admin, { view: "invalid" }));
});

test("repeated and concurrent archive actions are idempotent and do not enable disabled accounts", async () => {
  const original = legacyUser({ status: "disabled" });
  await db.collection<UserDocument>("users").insertOne(original);
  const id = original._id.toHexString();
  const results = await Promise.all([
    setClientArchived(db, admin, id, { archived: true }),
    setClientArchived(db, admin, id, { archived: true }),
  ]);
  assert.equal(results[0].archivedAt, results[1].archivedAt);
  assert.equal((await setClientArchived(db, admin, id, { archived: true })).archivedAt, results[0].archivedAt);
  await Promise.all([
    setClientArchived(db, admin, id, { archived: false }),
    setClientArchived(db, admin, id, { archived: false }),
  ]);
  assert.equal((await getClient(db, admin, id)).status, "disabled");
  assert.equal(await db.collection("audit_logs").countDocuments({ action: "client.archived" }), 1);
  assert.equal(await db.collection("audit_logs").countDocuments({ action: "client.unarchived" }), 1);
});

test("only administrators can archive or unarchive customer records", async () => {
  const record = legacyUser();
  const staff = legacyUser({ role: "billing-clerk", email: "staff@example.test" });
  await db.collection<UserDocument>("users").insertMany([record, staff]);
  const id = record._id.toHexString();
  for (const role of ["customer", "billing-clerk"] as const) {
    for (const archived of [true, false]) {
      await assert.rejects(setClientArchived(db, { ...admin, id, role }, id, { archived }),
        (error: unknown) => error instanceof ClientRequestError && error.status === 403);
    }
  }
  for (const archived of [true, false]) {
    for (const invalidId of [staff._id.toHexString(), new ObjectId().toHexString()]) {
      await assert.rejects(setClientArchived(db, admin, invalidId, { archived }),
        (error: unknown) => error instanceof ClientRequestError && error.status === 404);
    }
  }
  await assert.rejects(setClientArchived(db, admin, "invalid-id", { archived: true }),
    (error: unknown) => error instanceof ClientRequestError && error.status === 400);
  for (const input of [{}, { archived: "true" }, { archived: true, status: "disabled" }]) {
    await assert.rejects(setClientArchived(db, admin, id, input));
  }
  await assert.rejects(updateClient(db, admin, id, { ...details, clientArchivedAt: new Date() }));
  assert.equal((await getClient(db, admin, id)).archivedAt, null);
  assert.equal(await db.collection("audit_logs").countDocuments(), 0);
});
