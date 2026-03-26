import { type Request, type Response, type NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

declare module "express-session" {
  interface SessionData {
    userId: number;
    role: string;
    subscriptionTier: string;
    orgId: number | null;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}

export function requireTier(...tiers: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.session?.userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const userTier = req.session.subscriptionTier || "free";
    const tierHierarchy: Record<string, number> = { free: 0, pro: 1, enterprise: 2 };
    const userLevel = tierHierarchy[userTier] ?? 0;
    const requiredLevel = Math.min(...tiers.map(t => tierHierarchy[t] ?? 0));

    if (userLevel < requiredLevel) {
      res.status(403).json({ error: `This feature requires a ${tiers[0]} or higher plan` });
      return;
    }
    next();
  };
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  db.select({ role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, req.session.userId))
    .limit(1)
    .then((rows) => {
      if (rows.length === 0) {
        res.status(401).json({ error: "User not found" });
        return;
      }
      const currentRole = rows[0].role;
      if (currentRole !== "super_admin") {
        res.status(403).json({ error: "Super admin access required" });
        return;
      }
      req.session.role = currentRole;
      next();
    })
    .catch(() => {
      res.status(500).json({ error: "Authorization check failed" });
    });
}

export function requireOrgAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (req.session.role !== "org_admin" && req.session.role !== "super_admin") {
    res.status(403).json({ error: "Organization admin access required" });
    return;
  }
  next();
}
