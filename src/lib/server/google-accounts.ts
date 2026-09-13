import {
  collections,
  type NotificationDocument,
  type UserDocument,
} from "@/lib/database/collections";
import {
  GoogleAuthError,
  type GoogleLink,
  type GoogleProfile,
} from "@/lib/server/google-oauth";
import { type Db, MongoServerError, ObjectId } from "mongodb";

function classifyAccount(user: UserDocument, profile: GoogleProfile) {
  if (
    user.status !== "active" ||
    (user.googleSub && user.googleSub !== profile.sub)
  ) {
    throw new GoogleAuthError("account_unavailable");
  }
  if (!user.googleSub && !user.passwordHash)
    throw new GoogleAuthError("account_unavailable");
  return { user, created: false, needsLink: !user.googleSub };
}

export async function resolveGoogleAccount(db: Db, profile: GoogleProfile) {
  const users = db.collection<UserDocument>(collections.users);
  // Google's stable subject identifies returning users even if their email changes.
  const linked = await users.findOne({ googleSub: profile.sub });
  if (linked) return classifyAccount(linked, profile);
  const existing = await users.findOne({ email: profile.email });
  if (existing) return classifyAccount(existing, profile);

  const now = new Date();
  const user: UserDocument = {
    _id: new ObjectId(),
    email: profile.email,
    name: profile.name,
    googleSub: profile.sub,
    role: "customer",
    status: "active",
    authVersion: 0,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await users.insertOne(user);
  } catch (error) {
    if (!(error instanceof MongoServerError) || error.code !== 11000)
      throw error;
    const concurrent =
      (await users.findOne({ googleSub: profile.sub })) ??
      (await users.findOne({ email: profile.email }));
    if (!concurrent) throw error;
    return classifyAccount(concurrent, profile);
  }

  const admins = await users
    .find({ role: "admin", status: "active" }, { projection: { _id: 1 } })
    .toArray();
  if (admins.length) {
    await db
      .collection<NotificationDocument>(collections.notifications)
      .insertMany(
        admins.map((admin) => ({
          _id: new ObjectId(),
          userId: admin._id,
          title: "New customer account",
          body: `${user.name} registered a customer account with Google.`,
          href: "/admin/users-roles",
          kind: "account",
          entityId: user._id,
          createdAt: now,
        })),
      );
  }
  return { user, created: true, needsLink: false };
}

/** Call only after verifying this user's current password. */
export async function linkGoogleAccount(
  db: Db,
  user: UserDocument,
  link: GoogleLink,
) {
  if (
    link.userId !== user._id.toHexString() ||
    link.email !== user.email ||
    link.authVersion !== (user.authVersion ?? 0) ||
    user.status !== "active" ||
    (user.googleSub && user.googleSub !== link.googleSub)
  )
    throw new GoogleAuthError("account_unavailable");

  try {
    const result = await db
      .collection<UserDocument>(collections.users)
      .updateOne(
        {
          _id: user._id,
          email: user.email,
          status: "active",
          passwordHash: user.passwordHash,
          authVersion: user.authVersion ?? { $exists: false },
          $or: [
            { googleSub: { $exists: false } },
            { googleSub: link.googleSub },
          ],
        },
        { $set: { googleSub: link.googleSub, updatedAt: new Date() } },
      );
    if (result.matchedCount !== 1)
      throw new GoogleAuthError("account_unavailable");
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      throw new GoogleAuthError("account_unavailable");
    }
    throw error;
  }
}
