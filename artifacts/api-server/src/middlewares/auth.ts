import { type Request, type Response, type NextFunction } from "express";

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
  if (req.session.role !== "super_admin") {
    res.status(403).json({ error: "Super admin access required" });
    return;
  }
  next();
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
