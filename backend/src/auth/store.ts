import { randomUUID, createHash, randomBytes } from "node:crypto";
import fs from "fs/promises";
import path from "path";
import { MongoClient } from "mongodb";

let mongoClient: MongoClient | null = null;

async function getMongoClient(): Promise<MongoClient | null> {
  const uri = process.env.MONGODB_URI;
  if (!uri) return null;
  if (mongoClient) return mongoClient;
  mongoClient = new MongoClient(uri);
  await mongoClient.connect();
  return mongoClient;
}

async function getMongoDb() {
  const client = await getMongoClient();
  if (!client) return null;
  const dbName = process.env.MONGODB_DB ?? "star_cluster";
  return client.db(dbName);
}

export type User = {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  avatarUrl?: string | undefined;
  emailVerifiedAt?: number | undefined;
  friends?: string[] | undefined;
  createdAt: number;
};

export type EmailVerificationToken = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: number;
  usedAt?: number | undefined;
  createdAt: number;
};

export type PasswordResetToken = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: number;
  usedAt?: number | undefined;
  createdAt: number;
};

type AuthDb = {
  users: User[];
  emailVerificationTokens: EmailVerificationToken[];
  passwordResetTokens: PasswordResetToken[];
};

const DEFAULT_DB_RELATIVE_PATH = path.join("backend", "data", "auth.json");

function getDbPath() {
  return process.env.AUTH_DB_PATH
    ? path.resolve(process.env.AUTH_DB_PATH)
    : path.resolve(process.cwd(), DEFAULT_DB_RELATIVE_PATH);
}

async function ensureDbFile() {
  const dbPath = getDbPath();
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  try {
    await fs.access(dbPath);
  } catch {
    const initial: AuthDb = { users: [], emailVerificationTokens: [], passwordResetTokens: [] };
    await fs.writeFile(dbPath, JSON.stringify(initial, null, 2), "utf8");
  }
  return dbPath;
}

async function readDb(): Promise<AuthDb> {
  const dbPath = await ensureDbFile();
  const raw = await fs.readFile(dbPath, "utf8");
  const parsed = JSON.parse(raw) as Partial<AuthDb>;
  return {
    users: Array.isArray(parsed.users)
      ? (parsed.users as User[]).map((u) => ({
          ...u,
          friends: Array.isArray((u as any).friends)
            ? (((u as any).friends as unknown[]).filter((id) => typeof id === "string") as string[])
            : [],
        }))
      : [],
    emailVerificationTokens: Array.isArray((parsed as any).emailVerificationTokens)
      ? ((parsed as any).emailVerificationTokens as EmailVerificationToken[])
      : [],
    passwordResetTokens: Array.isArray(parsed.passwordResetTokens)
      ? (parsed.passwordResetTokens as PasswordResetToken[])
      : [],
  };
}

async function writeDb(db: AuthDb): Promise<void> {
  const dbPath = await ensureDbFile();
  const tmpPath = `${dbPath}.tmp-${randomUUID()}`;
  await fs.writeFile(tmpPath, JSON.stringify(db, null, 2), "utf8");
  await fs.rename(tmpPath, dbPath);
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function getUserById(id: string): Promise<User | null> {
  const mdb = await getMongoDb();
  if (mdb) {
    const doc = await mdb.collection<User>("users").findOne({ id });
    return doc ?? null;
  }
  const db = await readDb();
  return db.users.find((u) => u.id === id) ?? null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const normalized = normalizeEmail(email);
  const mdb = await getMongoDb();
  if (mdb) {
    const doc = await mdb.collection<User>("users").findOne({ email: normalized });
    return doc ?? null;
  }
  const db = await readDb();
  return db.users.find((u) => normalizeEmail(u.email) === normalized) ?? null;
}

export async function createUser(params: {
  email: string;
  passwordHash: string;
  name: string;
  avatarUrl?: string | undefined;
}): Promise<User> {
  const normalized = normalizeEmail(params.email);
  const mdb = await getMongoDb();
  if (mdb) {
    const existing = await mdb.collection<User>("users").findOne({ email: normalized });
    if (existing) throw new Error("EMAIL_TAKEN");
    const user: User = {
      id: randomUUID(),
      email: normalized,
      passwordHash: params.passwordHash,
      name: params.name,
      avatarUrl: params.avatarUrl,
      emailVerifiedAt: undefined,
      friends: [],
      createdAt: Date.now(),
    };
    await mdb.collection<User>("users").insertOne(user);
    return user;
  }
  const db = await readDb();
  if (db.users.some((u) => normalizeEmail(u.email) === normalized)) {
    throw new Error("EMAIL_TAKEN");
  }
  const user: User = {
    id: randomUUID(),
    email: normalized,
    passwordHash: params.passwordHash,
    name: params.name,
    avatarUrl: params.avatarUrl,
    emailVerifiedAt: undefined,
    friends: [],
    createdAt: Date.now(),
  };
  db.users.push(user);
  await writeDb(db);
  return user;
}

export async function addFriendByEmail(params: {
  userId: string;
  friendEmail: string;
}): Promise<User> {
  const mdb = await getMongoDb();
  const normalized = normalizeEmail(params.friendEmail);
  if (mdb) {
    const users = mdb.collection<User>("users");
    const me = await users.findOne({ id: params.userId });
    if (!me) throw new Error("USER_NOT_FOUND");
    const friend = await users.findOne({ email: normalized });
    if (!friend) throw new Error("FRIEND_NOT_FOUND");
    if (friend.id === me.id) throw new Error("CANNOT_FRIEND_SELF");
    await users.updateOne({ id: me.id }, { $addToSet: { friends: friend.id } });
    return friend;
  }
  const db = await readDb();
  const me = db.users.find((u) => u.id === params.userId);
  if (!me) throw new Error("USER_NOT_FOUND");
  const friend = db.users.find((u) => normalizeEmail(u.email) === normalized);
  if (!friend) throw new Error("FRIEND_NOT_FOUND");
  if (friend.id === me.id) throw new Error("CANNOT_FRIEND_SELF");
  if (!Array.isArray(me.friends)) me.friends = [];
  if (!me.friends.includes(friend.id)) {
    me.friends.push(friend.id);
    await writeDb(db);
  }
  return friend;
}

export async function listFriends(params: { userId: string }): Promise<User[]> {
  const mdb = await getMongoDb();
  if (mdb) {
    const users = mdb.collection<User>("users");
    const me = await users.findOne({ id: params.userId });
    if (!me) throw new Error("USER_NOT_FOUND");
    const ids = Array.isArray(me.friends) ? me.friends : [];
    if (ids.length === 0) return [];
    const friends = await users.find({ id: { $in: ids } }).toArray();
    const byId = new Map(friends.map((f) => [f.id, f] as const));
    return ids.map((id) => byId.get(id)).filter(Boolean) as User[];
  }
  const db = await readDb();
  const me = db.users.find((u) => u.id === params.userId);
  if (!me) throw new Error("USER_NOT_FOUND");
  const ids = Array.isArray(me.friends) ? me.friends : [];
  return ids.map((id) => db.users.find((u) => u.id === id)).filter(Boolean) as User[];
}

export async function updateUserProfile(params: {
  userId: string;
  name?: string | undefined;
  avatarUrl?: string | undefined;
}): Promise<User> {
  const mdb = await getMongoDb();
  if (mdb) {
    const users = mdb.collection<User>("users");
    const update: Partial<Pick<User, "name" | "avatarUrl">> = {};
    if (typeof params.name === "string" && params.name.trim()) update.name = params.name.trim();
    if (typeof params.avatarUrl === "string") update.avatarUrl = params.avatarUrl;
    const doc = await users.findOneAndUpdate({ id: params.userId }, { $set: update }, { returnDocument: "after" });
    if (!doc) throw new Error("USER_NOT_FOUND");
    return doc;
  }
  const db = await readDb();
  const user = db.users.find((u) => u.id === params.userId);
  if (!user) throw new Error("USER_NOT_FOUND");
  if (typeof params.name === "string" && params.name.trim()) {
    user.name = params.name.trim();
  }
  if (typeof params.avatarUrl === "string") {
    user.avatarUrl = params.avatarUrl;
  }
  await writeDb(db);
  return user;
}

export async function updateUserPassword(params: {
  userId: string;
  passwordHash: string;
}): Promise<void> {
  const mdb = await getMongoDb();
  if (mdb) {
    const res = await mdb.collection<User>("users").updateOne({ id: params.userId }, { $set: { passwordHash: params.passwordHash } });
    if (res.matchedCount === 0) throw new Error("USER_NOT_FOUND");
    return;
  }
  const db = await readDb();
  const user = db.users.find((u) => u.id === params.userId);
  if (!user) throw new Error("USER_NOT_FOUND");
  user.passwordHash = params.passwordHash;
  await writeDb(db);
}

export async function updateUserPasswordByEmail(params: {
  email: string;
  passwordHash: string;
}): Promise<void> {
  const normalized = normalizeEmail(params.email);
  const mdb = await getMongoDb();
  if (mdb) {
    const res = await mdb.collection<User>("users").updateOne({ email: normalized }, { $set: { passwordHash: params.passwordHash } });
    if (res.matchedCount === 0) throw new Error("USER_NOT_FOUND");
    return;
  }
  const db = await readDb();
  const user = db.users.find((u) => normalizeEmail(u.email) === normalized);
  if (!user) throw new Error("USER_NOT_FOUND");
  user.passwordHash = params.passwordHash;
  await writeDb(db);
}

export async function deleteUserById(userId: string): Promise<void> {
  const mdb = await getMongoDb();
  if (mdb) {
    await mdb.collection<User>("users").deleteOne({ id: userId });
    await mdb.collection<EmailVerificationToken>("emailVerificationTokens").deleteMany({ userId });
    await mdb.collection<PasswordResetToken>("passwordResetTokens").deleteMany({ userId });
    return;
  }
  const db = await readDb();
  db.users = db.users.filter((u) => u.id !== userId);
  db.emailVerificationTokens = db.emailVerificationTokens.filter((t) => t.userId !== userId);
  db.passwordResetTokens = db.passwordResetTokens.filter((t) => t.userId !== userId);
  await writeDb(db);
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function generateResetTokenValue() {
  return randomBytes(32).toString("hex");
}

export async function createPasswordResetToken(params: {
  userId: string;
  rawToken: string;
  ttlMs: number;
}): Promise<PasswordResetToken> {
  const mdb = await getMongoDb();
  if (mdb) {
    const token: PasswordResetToken = {
      id: randomUUID(),
      userId: params.userId,
      tokenHash: hashToken(params.rawToken),
      createdAt: Date.now(),
      expiresAt: Date.now() + params.ttlMs,
    };
    await mdb.collection<PasswordResetToken>("passwordResetTokens").insertOne(token);
    return token;
  }
  const db = await readDb();
  const token: PasswordResetToken = {
    id: randomUUID(),
    userId: params.userId,
    tokenHash: hashToken(params.rawToken),
    createdAt: Date.now(),
    expiresAt: Date.now() + params.ttlMs,
  };
  db.passwordResetTokens.push(token);
  await writeDb(db);
  return token;
}

export async function createEmailVerificationToken(params: {
  userId: string;
  rawToken: string;
  ttlMs: number;
}): Promise<EmailVerificationToken> {
  const mdb = await getMongoDb();
  if (mdb) {
    const token: EmailVerificationToken = {
      id: randomUUID(),
      userId: params.userId,
      tokenHash: hashToken(params.rawToken),
      createdAt: Date.now(),
      expiresAt: Date.now() + params.ttlMs,
    };
    await mdb.collection<EmailVerificationToken>("emailVerificationTokens").insertOne(token);
    return token;
  }
  const db = await readDb();
  const token: EmailVerificationToken = {
    id: randomUUID(),
    userId: params.userId,
    tokenHash: hashToken(params.rawToken),
    createdAt: Date.now(),
    expiresAt: Date.now() + params.ttlMs,
  };
  db.emailVerificationTokens.push(token);
  await writeDb(db);
  return token;
}

export async function consumeEmailVerificationToken(params: {
  rawToken: string;
}): Promise<{ userId: string } | null> {
  const mdb = await getMongoDb();
  const now = Date.now();
  const tokenHash = hashToken(params.rawToken);
  if (mdb) {
    const tokens = mdb.collection<EmailVerificationToken>("emailVerificationTokens");
    const doc = await tokens.findOneAndUpdate(
      { tokenHash, expiresAt: { $gt: now }, usedAt: { $exists: false } },
      { $set: { usedAt: now } },
      { returnDocument: "before" },
    );
    if (!doc) return null;
    await mdb.collection<User>("users").updateOne({ id: doc.userId }, { $set: { emailVerifiedAt: now } });
    return { userId: doc.userId };
  }
  const db = await readDb();
  const entry = db.emailVerificationTokens.find((t) => t.tokenHash === tokenHash && t.expiresAt > now);
  if (!entry) return null;
  if (!entry.usedAt) entry.usedAt = now;
  const user = db.users.find((u) => u.id === entry.userId);
  if (user) {
    if (!user.emailVerifiedAt) user.emailVerifiedAt = now;
  }
  await writeDb(db);
  return { userId: entry.userId };
}

export async function consumePasswordResetToken(params: {
  rawToken: string;
}): Promise<{ userId: string } | null> {
  const mdb = await getMongoDb();
  const now = Date.now();
  const tokenHash = hashToken(params.rawToken);
  if (mdb) {
    const tokens = mdb.collection<PasswordResetToken>("passwordResetTokens");
    const doc = await tokens.findOneAndUpdate(
      { tokenHash, expiresAt: { $gt: now }, usedAt: { $exists: false } },
      { $set: { usedAt: now } },
      { returnDocument: "before" },
    );
    if (!doc) return null;
    return { userId: doc.userId };
  }
  const db = await readDb();
  const entry = db.passwordResetTokens.find(
    (t) =>
      t.tokenHash === tokenHash &&
      !t.usedAt &&
      t.expiresAt > now,
  );
  if (!entry) return null;
  entry.usedAt = now;
  await writeDb(db);
  return { userId: entry.userId };
}

export async function setUserEmailVerifiedAt(params: { userId: string; at: number }): Promise<void> {
  const mdb = await getMongoDb();
  if (mdb) {
    await mdb.collection<User>("users").updateOne({ id: params.userId }, { $set: { emailVerifiedAt: params.at } });
    return;
  }
  const db = await readDb();
  const user = db.users.find((u) => u.id === params.userId);
  if (!user) throw new Error("USER_NOT_FOUND");
  user.emailVerifiedAt = params.at;
  await writeDb(db);
}

export async function clearAuthData(): Promise<void> {
  const mdb = await getMongoDb();
  if (mdb) {
    await mdb.collection<User>("users").deleteMany({});
    await mdb.collection<EmailVerificationToken>("emailVerificationTokens").deleteMany({});
    await mdb.collection<PasswordResetToken>("passwordResetTokens").deleteMany({});
    return;
  }
  await writeDb({ users: [], emailVerificationTokens: [], passwordResetTokens: [] });
}
