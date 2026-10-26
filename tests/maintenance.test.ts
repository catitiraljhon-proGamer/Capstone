import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { hash } from "bcryptjs";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { ObjectId, type Db } from "mongodb";
import { ZodError } from "zod";
import { getDatabase } from "@/lib/database/mongodb";
import type { HouseDesignDocument, UserDocument } from "@/lib/database/collections";
import {
  getPublicSettings,
  getSystemSettings,
  getSystemSettingsView,
  MaintenanceError,
  requirePasswordPolicy,
  updateSystemSettings,
} from "@/lib/server/maintenance";
import {
  backupCollections,
  createBackup,
  listBackups,
  pruneAutomaticBackups,
  readBackupChunk,
  receiveBackupUpload,
  restoreBackup,
  runDailyBackup,
} from "@/lib/server/backup";
import { readMaintenanceMode } from "@/lib/server/maintenance-mode";
import { getContactDetails, updateContactDetails } from "@/lib/server/contact-details";
import { defaultContactDetails, phoneHref } from "@/lib/contact-details";
import { getHomeSlides, updateHomeSlideshow } from "@/lib/server/home-slideshow";
import { getAboutUsContent, getAboutUsView, updateAboutUsContent } from "@/lib/server/about-us";
import { defaultAboutUs } from "@/lib/about-us";
import {
  createProfessional,
  getAboutUsProfessionals,
  getManagedProfessionals,
  getProfessionalDesigns,
  removeProfessional,
  reorderProfessionals,
  requireProfessionalId,
  updateProfessional,
} from "@/lib/server/professionals";
import { accountTerms, termsText, type AccountTermsContent } from "@/lib/account-terms";
import {
  acceptAccountTerms,
  getAccountTermsVersion,
  getCurrentTerms,
  publishAccountTerms,
  requireAccountTerms,
  requireCurrentTerms,
} from "@/lib/server/account-terms";
import { defaultPasswordPolicy, defaultRoomSizes, defaultSystemSettings, PasswordPolicyError } from "@/lib/system-settings";
import type { SessionUser } from "@/types/domain";

let mongo: MongoMemoryReplSet;
let db: Db;
let backupFolder: string;
const adminPassword = "Admin-password-2026";
const admin: SessionUser = { id: new ObjectId().toHexString(), name: "Admin", email: "admin@example.test", role: "admin" };
const clerk: SessionUser = { id: new ObjectId().toHexString(), name: "Billing Clerk", email: "clerk@example.test", role: "billing-clerk" };
const designId = new ObjectId();
const isStatus = (status: number) => (error: unknown) => error instanceof MaintenanceError && error.status === status;

before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  process.env.MONGODB_URI = mongo.getUri();
  process.env.MONGODB_DB = "isolated_maintenance_tests";
  db = await getDatabase();
});
beforeEach(async () => {
  assert.equal(db.databaseName, "isolated_maintenance_tests");
  backupFolder = await mkdtemp(path.join(tmpdir(), "g4-backups-"));
  process.env.BACKUP_LOCAL_DIR = backupFolder;
  await Promise.all(["house_designs", "audit_logs", "rate_limits", "system_settings", "users", "backup_uploads", "professionals"].map((name) => db.collection(name).deleteMany({})));
  const now = new Date();
  await db.collection<UserDocument>("users").insertMany([admin, clerk].map((actor) => ({
    _id: new ObjectId(actor.id), name: actor.name, email: actor.email, role: actor.role, status: "active" as const,
    authVersion: 0, createdAt: now, updatedAt: now,
  })));
  await db.collection<UserDocument>("users").updateOne({ _id: new ObjectId(admin.id) }, { $set: { passwordHash: await hash(adminPassword, 4) } });
  await db.collection<HouseDesignDocument>("house_designs").insertOne({
    _id: designId, name: "Test design", area: 90, rooms: "2 bedrooms", rate: 25000,
    images: ["https://example.test/design.jpg"], notes: "", status: "Published",
    customItems: [], createdAt: now, createdBy: new ObjectId(admin.id), createdByName: admin.name, updatedAt: now,
  });
});
afterEach(() => rm(backupFolder, { recursive: true, force: true }));
after(async () => {
  await db?.client.close();
  await mongo?.stop();
});

test("settings start at the system's previous fixed values and only the Admin can change them, within limits", async () => {
  assert.deepEqual(await getSystemSettings(db), defaultSystemSettings);
  await assert.rejects(updateSystemSettings(db, clerk, { passwordMinLength: 12 }), isStatus(403));
  await assert.rejects(updateSystemSettings(db, admin, { passwordMinLength: 7 }), ZodError);
  await assert.rejects(updateSystemSettings(db, admin, { passwordMinLength: 12.5 }), ZodError);
  await assert.rejects(updateSystemSettings(db, admin, { unknownSetting: 1 }), ZodError);
  await assert.rejects(updateSystemSettings(db, admin, { autoBackup: "yes" }), ZodError);
  await assert.rejects(updateSystemSettings(db, admin, { inactiveNoticeDays: 30 }), isStatus(400));
});

test("saving records who changed each setting and audits old and new values", async () => {
  const view = await updateSystemSettings(db, admin, { passwordMinLength: 12, emailCopiesCustomer: false, loginMaxAttempts: 5 });
  assert.equal(view.settings.passwordMinLength, 12);
  assert.equal(view.settings.emailCopiesCustomer, false);
  assert.equal(view.changes.passwordMinLength?.by, "Admin");
  // Unchanged values are not stamped.
  assert.equal(view.changes.loginMaxAttempts, undefined);
  const log = await db.collection("audit_logs").findOne({ action: "Updated settings" });
  assert.deepEqual(log?.details, { "Minimum length": "8 characters → 12 characters", Customer: "On → Off" });
  assert.equal((await getSystemSettingsView(db)).settings.passwordMinLength, 12);
});

test("the Admin sets the room sizes for the floor area warning, and every form can read them", async () => {
  assert.deepEqual(await getPublicSettings(db), { ...defaultPasswordPolicy, idleSignOutMinutes: 0, ...defaultRoomSizes });
  await assert.rejects(updateSystemSettings(db, admin, { roomBedroomSqm: 0 }), ZodError);
  await assert.rejects(updateSystemSettings(db, admin, { roomBathroomSqm: 1.2 }), ZodError);
  await assert.rejects(updateSystemSettings(db, admin, { roomWallsPercent: 101 }), ZodError);
  await updateSystemSettings(db, admin, { roomBedroomSqm: 10, roomWallsPercent: 0 });
  const log = await db.collection("audit_logs").findOne({ action: "Updated settings" });
  assert.deepEqual(log?.details, { Bedroom: "9 sqm → 10 sqm", "Walls and hallways": "20 percent → 0 percent" });
  assert.deepEqual(await getPublicSettings(db), {
    ...defaultPasswordPolicy, idleSignOutMinutes: 0, ...defaultRoomSizes, roomBedroomSqm: 10, roomWallsPercent: 0,
  });
});

test("the Admin edits the Contact Us details, which are checked, stamped, and audited", async () => {
  assert.deepEqual(await getContactDetails(db), defaultContactDetails);
  const next = { phone: "+63 917 555 0142", email: "projects@g4builders.test", address: "123 Rizal Avenue, Balayan, Batangas, 4213" };
  await assert.rejects(updateContactDetails(db, clerk, next), isStatus(403));
  for (const bad of [{ phone: "call us" }, { phone: "12-34" }, { email: "not-an-email" }, { address: "Balayan" }, { website: "https://example.test" }]) {
    await assert.rejects(updateContactDetails(db, admin, { ...next, ...bad }), ZodError);
  }
  const view = await updateContactDetails(db, admin, { ...next, address: defaultContactDetails.address });
  assert.deepEqual(view.contact, { ...next, address: defaultContactDetails.address });
  assert.equal(view.changes.phone?.by, "Admin");
  // The unchanged address is not stamped or audited.
  assert.equal(view.changes.address, undefined);
  const log = await db.collection("audit_logs").findOne({ action: "Updated contact details" });
  assert.deepEqual(log?.details, {
    "Phone number": `${defaultContactDetails.phone} → +63 917 555 0142`,
    "Email address": `${defaultContactDetails.email} → projects@g4builders.test`,
  });
  assert.equal((await getContactDetails(db)).phone, "+63 917 555 0142");
  // The system settings stored beside them are untouched.
  assert.deepEqual(await getSystemSettings(db), defaultSystemSettings);
  assert.equal(phoneHref("(043) 407 3561"), "tel:+63434073561");
  assert.equal(phoneHref("+63 917 555 0142"), "tel:+639175550142");
});

/** The editable parts of a version: what the Maintenance editor sends. */
const termsContent = (terms: AccountTermsContent) => Object.fromEntries(Object.entries(terms).filter(([key]) => key !== "version"));
const withNewSection = (terms: AccountTermsContent, title: string) => ({
  ...termsContent(terms),
  sections: [...terms.sections, { title, body: `${title} applies to every request submitted through the portal.` }],
});

test("the Admin publishes edited Terms and Conditions as new versions, and earlier versions never change", async () => {
  assert.deepEqual(await getCurrentTerms(db), accountTerms);
  const morning = new Date("2026-10-24T02:00:00.000Z");
  await assert.rejects(publishAccountTerms(db, clerk, withNewSection(accountTerms, "Site Visits")), isStatus(403));
  await assert.rejects(publishAccountTerms(db, admin, termsContent(accountTerms), morning), isStatus(400));
  for (const bad of [{ sections: [] }, { title: "" }, { version: "2099-01-01" }]) {
    await assert.rejects(publishAccountTerms(db, admin, { ...termsContent(accountTerms), ...bad }, morning), ZodError);
  }

  const first = await publishAccountTerms(db, admin, withNewSection(accountTerms, "Site Visits"), morning);
  assert.equal(first.current.version, "2026-10-24");
  assert.equal(first.current.sections.at(-1)?.title, "Site Visits");
  // A second version on the same day gets its own number.
  const second = await publishAccountTerms(db, admin, withNewSection(first.current, "Warranty"), new Date("2026-10-24T09:00:00.000Z"));
  assert.equal(second.current.version, "2026-10-24.2");
  assert.deepEqual(second.versions.map((item) => [item.version, item.publishedBy]), [
    ["2026-10-24.2", "Admin"], ["2026-10-24", "Admin"], [accountTerms.version, null],
  ]);

  assert.deepEqual(await getCurrentTerms(db), second.current);
  assert.deepEqual(await getAccountTermsVersion(db, "2026-10-24"), first.current);
  assert.deepEqual(await getAccountTermsVersion(db, accountTerms.version), accountTerms);
  await assert.rejects(getAccountTermsVersion(db, "1999-01-01"), isStatus(404));
  const logs = await db.collection("audit_logs").find({ action: "Published Terms and Conditions" }).sort({ createdAt: 1 }).toArray();
  assert.deepEqual(logs.map((log) => log.details.Version), ["2026-10-24", "2026-10-24.2"]);
  assert.equal(logs[1].details.termsSnapshot, termsText(second.current));
  // The other settings stored beside the terms are untouched.
  assert.deepEqual(await getSystemSettings(db), defaultSystemSettings);
});

test("customers who already agreed keep their agreement after a new version; new agreements need the current one", async () => {
  const [agreed, newcomer] = ["Agreed Customer", "New Customer"].map((name): SessionUser => ({
    id: new ObjectId().toHexString(), name, email: `${name.split(" ")[0].toLowerCase()}@example.test`, role: "customer",
  }));
  const now = new Date();
  await db.collection<UserDocument>("users").insertMany([agreed, newcomer].map((customer) => ({
    _id: new ObjectId(customer.id), name: customer.name, email: customer.email, role: "customer" as const, status: "active" as const,
    authVersion: 0, createdAt: now, updatedAt: now,
  })));
  await acceptAccountTerms(db, agreed, { accepted: true, version: accountTerms.version });

  const { current } = await publishAccountTerms(db, admin, withNewSection(accountTerms, "Site Visits"));
  assert.equal((await requireAccountTerms(db, agreed)).version, accountTerms.version);
  // Agreeing again keeps the first agreement; the customer is not asked to agree to the new version.
  assert.equal((await acceptAccountTerms(db, agreed, { accepted: true, version: current.version })).version, accountTerms.version);

  await assert.rejects(acceptAccountTerms(db, newcomer, { accepted: true, version: accountTerms.version }), ZodError);
  await assert.rejects(requireCurrentTerms(db, accountTerms.version), ZodError);
  assert.equal((await acceptAccountTerms(db, newcomer, { accepted: true, version: current.version })).version, current.version);
  const record = await db.collection("audit_logs").findOne({ action: "account.terms-accepted", actorId: new ObjectId(newcomer.id) });
  assert.equal(record?.details.termsSnapshot, termsText(current));
  assert.match(String(record?.details.termsSnapshot), /Site Visits/);
});

test("the Admin picks the home page slideshow designs in order, and unpublished designs drop out", async () => {
  const designs = db.collection<HouseDesignDocument>("house_designs");
  const base = (await designs.findOne({ _id: designId }))!;
  const design = (name: string, day: number, extra: Partial<HouseDesignDocument> = {}): HouseDesignDocument => ({
    ...base, _id: new ObjectId(), name, createdAt: new Date(Date.UTC(2026, 9, day)),
    images: [`https://example.test/${day}.jpg`, `https://example.test/${day}-side.jpg`], ...extra,
  });
  const numbered = [1, 2, 3, 4, 5].map((day) => design(`Design ${day}`, day));
  const first = numbered[0];
  const draft = design("Draft design", 20, { status: "Draft" });
  const noPhoto = design("No photo", 21, { images: [] });
  await designs.insertMany([...numbered, draft, noPhoto]);
  const names = async () => (await getHomeSlides(db)).map((slide) => slide.name);

  // Nothing picked: the newest Published designs with a photo, one cover photo each.
  assert.deepEqual(await names(), ["Test design", "Design 5", "Design 4", "Design 3"]);
  assert.equal((await getHomeSlides(db))[1].image, "https://example.test/5.jpg");

  const ids = (...picked: HouseDesignDocument[]) => ({ designIds: picked.map((item) => item._id.toHexString()) });
  await assert.rejects(updateHomeSlideshow(db, clerk, ids(first)), isStatus(403));
  for (const bad of [ids(...numbered), ids(first, first), { designIds: ["not-an-id"] }, { designIds: [], extra: true }]) {
    await assert.rejects(updateHomeSlideshow(db, admin, bad), ZodError);
  }
  await assert.rejects(updateHomeSlideshow(db, admin, ids(draft)), isStatus(400));
  await assert.rejects(updateHomeSlideshow(db, admin, ids(noPhoto)), isStatus(400));

  const view = await updateHomeSlideshow(db, admin, { designIds: [first._id.toHexString(), designId.toHexString()] });
  assert.deepEqual(view.chosen, [first._id.toHexString(), designId.toHexString()]);
  assert.equal(view.changedBy, "Admin");
  assert.deepEqual(await names(), ["Design 1", "Test design"]);
  const log = await db.collection("audit_logs").findOne({ action: "Updated home page slideshow" });
  assert.deepEqual(log?.details, { Slideshow: "Newest published designs → Design 1, Test design" });

  await designs.updateOne({ _id: first._id }, { $set: { status: "Archived" } });
  assert.deepEqual(await names(), ["Test design"]);
  await designs.updateOne({ _id: designId }, { $set: { status: "Archived" } });
  assert.deepEqual(await names(), ["Design 5", "Design 4", "Design 3", "Design 2"]);
  // The other settings stored beside the slideshow are untouched.
  assert.deepEqual(await getSystemSettings(db), defaultSystemSettings);
});

test("the Admin edits the About Us text; the built-in text shows until then", async () => {
  assert.deepEqual(await getAboutUsContent(db), defaultAboutUs);
  await assert.rejects(getAboutUsView(db, clerk), isStatus(403));
  assert.equal((await getAboutUsView(db, admin)).changedBy, null);

  const edited = {
    ...defaultAboutUs,
    intro: "  G4 Builders Incorporated designs and builds houses in the province.  ",
    services: defaultAboutUs.services.map((service, index) => (index === 2 ? { ...service, title: "Plans and Blueprints" } : service)),
  };
  await assert.rejects(updateAboutUsContent(db, clerk, edited), isStatus(403));
  for (const bad of [
    { ...edited, tagline: " " }, { ...edited, intro: "Too short" }, { ...edited, services: edited.services.slice(1) },
    { ...edited, services: [...edited.services.slice(1), { title: "X", text: "Too short" }] }, { ...edited, extra: true },
  ]) {
    await assert.rejects(updateAboutUsContent(db, admin, bad), ZodError);
  }

  const view = await updateAboutUsContent(db, admin, edited);
  assert.equal(view.content.intro, "G4 Builders Incorporated designs and builds houses in the province.");
  assert.equal(view.changedBy, "Admin");
  assert.equal((await getAboutUsContent(db)).services[2].title, "Plans and Blueprints");
  const log = await db.collection("audit_logs").findOne({ action: "Updated the About Us page" });
  assert.deepEqual(log?.details, { Changed: "Introduction, What We Do item 3" });

  // Saving the same text again changes nothing and logs nothing; the other settings beside it are untouched.
  await updateAboutUsContent(db, admin, edited);
  assert.equal(await db.collection("audit_logs").countDocuments({ action: "Updated the About Us page" }), 1);
  assert.deepEqual(await getSystemSettings(db), defaultSystemSettings);
});

test("the Admin keeps the About Us team, and designs are credited to them", async () => {
  // The first read adds the starting list once.
  assert.deepEqual((await getAboutUsProfessionals(db)).map((person) => [person.name, person.role]), [
    ["Arch. Sherwin Macalalad", "Architect"],
    ["Arch. Marlo Baral Diaz", "Architect"],
    ["Engr. Gina R. Abellar", "Engineer"],
  ]);
  await assert.rejects(getManagedProfessionals(db, clerk), isStatus(403));

  const input = {
    name: "Engr. Test Person", role: "Engineer", specialization: "Structural design", licenseNumber: "0123456",
    yearsOfExperience: 9, bio: "Checks every structural plan.", photo: "", visible: true,
  };
  await assert.rejects(createProfessional(db, clerk, input), isStatus(403));
  for (const bad of [
    { ...input, role: "Plumber" }, { ...input, licenseNumber: "12-34" }, { ...input, name: "A" },
    { ...input, photo: "https://example.test/photo.jpg" }, { ...input, yearsOfExperience: 2.5 }, { ...input, extra: true },
  ]) {
    await assert.rejects(createProfessional(db, admin, bad), ZodError);
  }
  // Designers and contractors are listed too.
  for (const role of ["Designer", "Contractor"]) {
    assert.equal((await createProfessional(db, admin, { ...input, name: `Test ${role}`, role })).at(-1)?.role, role);
  }
  let list = await createProfessional(db, admin, input);
  const added = list.at(-1)!;
  assert.equal(list.length, 6);
  assert.deepEqual({ ...added, id: "" }, { ...input, id: "", designCount: 0 });

  // A Published design credited to the person counts and shows in their profile, cover photo only.
  await db.collection<HouseDesignDocument>("house_designs").updateOne({ _id: designId }, { $set: { designedBy: new ObjectId(added.id) } });
  assert.equal((await getAboutUsProfessionals(db)).at(-1)?.designCount, 1);
  assert.deepEqual(await getProfessionalDesigns(db, added.id), [
    { designId: designId.toHexString(), name: "Test design", image: "https://example.test/design.jpg" },
  ]);

  // Hidden people leave the About Us page, and so do their designs.
  list = await updateProfessional(db, admin, added.id, { visible: false });
  assert.equal((await getAboutUsProfessionals(db)).length, 5);
  await assert.rejects(getProfessionalDesigns(db, added.id), isStatus(404));
  assert.ok(await db.collection("audit_logs").findOne({ action: "Updated a team member", "details.Changed": "Shown on About Us" }));

  // The order needs every person exactly once.
  const ids = list.map((person) => person.id);
  await assert.rejects(reorderProfessionals(db, admin, { ids: ids.slice(1) }), isStatus(409));
  list = await reorderProfessionals(db, admin, { ids: [...ids].reverse() });
  assert.deepEqual(list.map((person) => person.id), [...ids].reverse());

  // Removing someone clears the credit on their designs, and a list the Admin emptied stays empty.
  await removeProfessional(db, admin, added.id);
  assert.equal((await db.collection<HouseDesignDocument>("house_designs").findOne({ _id: designId }))?.designedBy, undefined);
  await assert.rejects(requireProfessionalId(db, added.id), isStatus(400));
  for (const person of await getManagedProfessionals(db, admin)) await removeProfessional(db, admin, person.id);
  assert.deepEqual(await getAboutUsProfessionals(db), []);
});

test("new passwords follow the Admin's password rules", async () => {
  await requirePasswordPolicy(db, "eightchr");
  await updateSystemSettings(db, admin, { passwordMinLength: 10, passwordLettersAndNumbers: true, passwordUpperAndSymbol: true });
  await assert.rejects(requirePasswordPolicy(db, "Short-1"), PasswordPolicyError);
  await assert.rejects(requirePasswordPolicy(db, "OnlyLetters-x"), /letters and numbers/);
  await assert.rejects(requirePasswordPolicy(db, "lowercase-2026"), /uppercase letter and a symbol/);
  await requirePasswordPolicy(db, "Strong-pass-2026");
});

test("a backup can be listed, downloaded in pieces, and restored with the Admin's password", async () => {
  assert.ok(!backupCollections.includes("rate_limits" as never));
  const saved = await createBackup(db, admin, "manual");
  assert.equal(saved.type, "manual");
  assert.equal(saved.createdBy, "Admin");
  assert.deepEqual((await listBackups()).map((record) => record.id), [saved.id]);
  const chunk = await readBackupChunk(saved.id, 0);
  assert.equal(chunk.chunks, 1);
  assert.equal(Buffer.from(chunk.data, "base64").length, saved.size);

  // Changes made after the backup are undone by the restore.
  await db.collection<HouseDesignDocument>("house_designs").updateOne({ _id: designId }, { $set: { name: "Renamed later" } });
  await db.collection("house_designs").insertOne({ name: "Added later" });

  await assert.rejects(restoreBackup(db, clerk, saved.id, { password: adminPassword }), isStatus(403));
  await assert.rejects(restoreBackup(db, admin, saved.id, { password: "wrong-password" }), isStatus(403));
  await assert.rejects(restoreBackup(db, admin, "../../etc/passwd", { password: adminPassword }), ZodError);

  const result = await restoreBackup(db, admin, saved.id, { password: adminPassword });
  const designs = await db.collection<HouseDesignDocument>("house_designs").find().toArray();
  assert.deepEqual(designs.map((design) => design.name), ["Test design"]);
  assert.ok(designs[0]._id instanceof ObjectId);
  assert.ok(designs[0].createdAt instanceof Date);
  // Everyone signs in again, maintenance is back off, and the restore stays in the audit log.
  assert.ok((await db.collection<UserDocument>("users").find().toArray()).every((user) => user.authVersion === 1));
  assert.equal((await readMaintenanceMode(db, new Date(), { fresh: true })).active, false);
  assert.ok(await db.collection("audit_logs").findOne({ action: "Restored database backup" }));
  const safety = (await listBackups()).find((record) => record.id === result.safetyBackup);
  assert.equal(safety?.type, "before-restore");
});

test("an uploaded backup file is checked, then added to the list ready to restore", async () => {
  const saved = await createBackup(db, admin, "manual");
  const data = Buffer.from((await readBackupChunk(saved.id, 0)).data, "base64");
  const half = Math.ceil(data.length / 2);
  const uploadId = "upload-test-1";
  const first = await receiveBackupUpload(db, admin, { uploadId, index: 0, total: 2, data: data.subarray(0, half).toString("base64") });
  assert.equal(first.complete, false);
  const second = await receiveBackupUpload(db, admin, { uploadId, index: 1, total: 2, data: data.subarray(half).toString("base64") });
  assert.equal(second.complete && second.backup.type, "uploaded");
  assert.equal(await db.collection("backup_uploads").countDocuments(), 0);

  await assert.rejects(
    receiveBackupUpload(db, admin, { uploadId: "upload-test-2", index: 0, total: 1, data: Buffer.from("{\"hello\":1}").toString("base64") }),
    /not a G4 Builders backup/,
  );
});

test("daily backups follow the Admin's setting and keep only the newest automatic ones", async () => {
  await updateSystemSettings(db, admin, { autoBackup: false });
  assert.deepEqual(await runDailyBackup(db), { created: null });
  await updateSystemSettings(db, admin, { autoBackup: true, keepAutomaticBackups: 2 });
  const manual = await createBackup(db, admin, "manual", new Date("2026-10-01T00:00:00Z"));
  for (const day of [1, 2, 3]) await createBackup(db, admin, "automatic", new Date(`2026-10-0${day}T17:00:00Z`));
  await pruneAutomaticBackups(2);
  const remaining = await listBackups();
  assert.deepEqual(remaining.filter((record) => record.type === "automatic").map((record) => record.createdAt), [
    "2026-10-03T17:00:00.000Z", "2026-10-02T17:00:00.000Z",
  ]);
  assert.ok(remaining.some((record) => record.id === manual.id));
});
