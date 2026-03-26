import { Router, type IRouter } from "express";
import { db, usersTable, organizationsTable, quotesTable } from "@workspace/db";
import { eq, ilike, sql, count, or } from "drizzle-orm";
import { requireSuperAdmin } from "../middlewares/auth";

const router: IRouter = Router();

router.use("/admin", requireSuperAdmin);

router.get("/admin/stats", async (_req, res): Promise<void> => {
  const [userCount] = await db.select({ value: count() }).from(usersTable);
  const [quoteCount] = await db.select({ value: count() }).from(quotesTable);
  const [orgCount] = await db.select({ value: count() }).from(organizationsTable);

  const tierRows = await db
    .select({
      tier: usersTable.subscriptionTier,
      count: count(),
    })
    .from(usersTable)
    .groupBy(usersTable.subscriptionTier);

  const roleRows = await db
    .select({
      role: usersTable.role,
      count: count(),
    })
    .from(usersTable)
    .groupBy(usersTable.role);

  const usersByTier: Record<string, number> = {};
  for (const row of tierRows) {
    usersByTier[row.tier] = row.count;
  }

  const usersByRole: Record<string, number> = {};
  for (const row of roleRows) {
    usersByRole[row.role] = row.count;
  }

  res.json({
    totalUsers: userCount.value,
    totalQuotes: quoteCount.value,
    totalOrganizations: orgCount.value,
    usersByTier,
    usersByRole,
  });
});

router.get("/admin/users", async (req, res): Promise<void> => {
  const search = typeof req.query.search === "string" ? req.query.search : "";
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const offset = Number(req.query.offset) || 0;

  const whereClause = search
    ? or(
        ilike(usersTable.email, `%${search}%`),
        ilike(usersTable.name, `%${search}%`)
      )
    : undefined;

  const [totalRow] = await db
    .select({ value: count() })
    .from(usersTable)
    .where(whereClause);

  const users = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      role: usersTable.role,
      subscriptionTier: usersTable.subscriptionTier,
      orgId: usersTable.orgId,
      brokerage: usersTable.brokerage,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .where(whereClause)
    .orderBy(usersTable.id)
    .limit(limit)
    .offset(offset);

  res.json({ users, total: totalRow.value });
});

router.patch("/admin/users/:id", async (req, res): Promise<void> => {
  const userId = Number(req.params.id);
  if (!userId || isNaN(userId)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  const { role, subscriptionTier } = req.body;

  const validRoles = ["agent", "org_admin", "super_admin"];
  const validTiers = ["free", "pro", "enterprise"];

  const updates: Record<string, string> = {};
  if (role !== undefined) {
    if (!validRoles.includes(role)) {
      res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(", ")}` });
      return;
    }
    updates.role = role;
  }
  if (subscriptionTier !== undefined) {
    if (!validTiers.includes(subscriptionTier)) {
      res.status(400).json({ error: `Invalid tier. Must be one of: ${validTiers.join(", ")}` });
      return;
    }
    updates.subscriptionTier = subscriptionTier;
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, userId))
    .returning({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      role: usersTable.role,
      subscriptionTier: usersTable.subscriptionTier,
      orgId: usersTable.orgId,
      brokerage: usersTable.brokerage,
      createdAt: usersTable.createdAt,
    });

  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(updated);
});

router.get("/admin/organizations", async (req, res): Promise<void> => {
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const offset = Number(req.query.offset) || 0;

  const [totalRow] = await db.select({ value: count() }).from(organizationsTable);

  const orgs = await db
    .select({
      id: organizationsTable.id,
      name: organizationsTable.name,
      coBrandName: organizationsTable.coBrandName,
      seatCount: organizationsTable.seatCount,
      createdAt: organizationsTable.createdAt,
      memberCount: sql<number>`(SELECT COUNT(*) FROM users WHERE org_id = ${organizationsTable.id})`.as("member_count"),
    })
    .from(organizationsTable)
    .orderBy(organizationsTable.id)
    .limit(limit)
    .offset(offset);

  res.json({ organizations: orgs, total: totalRow.value });
});

router.patch("/admin/organizations/:id", async (req, res): Promise<void> => {
  const orgId = Number(req.params.id);
  if (!orgId || isNaN(orgId)) {
    res.status(400).json({ error: "Invalid organization ID" });
    return;
  }

  const { name, coBrandName, seatCount } = req.body;

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (coBrandName !== undefined) updates.coBrandName = coBrandName;
  if (seatCount !== undefined) {
    const sc = Number(seatCount);
    if (isNaN(sc) || sc < 1) {
      res.status(400).json({ error: "Seat count must be a positive integer" });
      return;
    }
    updates.seatCount = sc;
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }

  const [updated] = await db
    .update(organizationsTable)
    .set(updates)
    .where(eq(organizationsTable.id, orgId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }

  res.json(updated);
});

export default router;
