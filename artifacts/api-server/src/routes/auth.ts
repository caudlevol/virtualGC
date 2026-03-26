import { Router, type IRouter } from "express";
import bcrypt from "bcrypt";
import { db, usersTable, organizationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  RegisterBody,
  LoginBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password, name, brokerage, orgName } = parsed.data;

  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  let orgId: number | null = null;
  let orgNameResult: string | null = null;
  if (orgName) {
    const [org] = await db.insert(organizationsTable).values({ name: orgName }).returning();
    orgId = org.id;
    orgNameResult = org.name;
  }

  const [user] = await db.insert(usersTable).values({
    email,
    passwordHash,
    name,
    brokerage: brokerage || null,
    orgId,
    role: orgId ? "org_admin" : "agent",
    subscriptionTier: "free",
  }).returning();

  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = user.id;
      req.session.role = user.role;
      req.session.subscriptionTier = user.subscriptionTier;
      req.session.orgId = user.orgId;
      req.session.save((err2) => {
        if (err2) return reject(err2);
        resolve();
      });
    });
  });

  const responseData = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    subscriptionTier: user.subscriptionTier,
    orgId: user.orgId,
    orgName: orgNameResult,
    coBrandName: null,
  };

  res.status(201).json(responseData);
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password } = parsed.data;

  const users = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (users.length === 0) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const user = users[0];
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = user.id;
      req.session.role = user.role;
      req.session.subscriptionTier = user.subscriptionTier;
      req.session.orgId = user.orgId;
      req.session.save((err2) => {
        if (err2) return reject(err2);
        resolve();
      });
    });
  });

  let orgName: string | null = null;
  let coBrandName: string | null = null;
  if (user.orgId) {
    const orgs = await db.select().from(organizationsTable).where(eq(organizationsTable.id, user.orgId)).limit(1);
    if (orgs.length > 0) {
      orgName = orgs[0].name;
      coBrandName = orgs[0].coBrandName;
    }
  }

  const responseData = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    subscriptionTier: user.subscriptionTier,
    orgId: user.orgId,
    orgName,
    coBrandName,
  };

  res.json(responseData);
});

router.post("/auth/logout", (req, res): void => {
  req.session.destroy((err) => {
    if (err) {
      res.status(500).json({ error: "Failed to logout" });
      return;
    }
    res.json({ message: "Logged out successfully" });
  });
});

router.get("/auth/session", async (req, res): Promise<void> => {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const users = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId)).limit(1);
  if (users.length === 0) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  const user = users[0];
  let orgName: string | null = null;
  let coBrandName: string | null = null;
  if (user.orgId) {
    const orgs = await db.select().from(organizationsTable).where(eq(organizationsTable.id, user.orgId)).limit(1);
    if (orgs.length > 0) {
      orgName = orgs[0].name;
      coBrandName = orgs[0].coBrandName;
    }
  }

  const responseData = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    subscriptionTier: user.subscriptionTier,
    orgId: user.orgId,
    orgName,
    coBrandName,
  };

  res.json(responseData);
});

export default router;
