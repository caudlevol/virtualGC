import bcrypt from "bcrypt";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_NAME = process.env.ADMIN_NAME || "Admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

async function seedAdmin() {
  if (!ADMIN_EMAIL) {
    console.error("ADMIN_EMAIL env var is required.");
    console.error("Usage: ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=secret pnpm run seed:admin");
    process.exit(1);
  }

  console.log(`Seeding super_admin account: ${ADMIN_EMAIL}`);

  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, ADMIN_EMAIL))
    .limit(1);

  if (existing.length > 0) {
    const user = existing[0];
    if (user.role === "super_admin" && user.subscriptionTier === "enterprise") {
      console.log("Admin account already exists with correct role/tier. No changes needed.");
      process.exit(0);
    }

    const [updated] = await db
      .update(usersTable)
      .set({ role: "super_admin", subscriptionTier: "enterprise" })
      .where(eq(usersTable.id, user.id))
      .returning();

    console.log(`Promoted existing user #${updated.id} to super_admin / enterprise.`);
    process.exit(0);
  }

  if (!ADMIN_PASSWORD) {
    console.error("ADMIN_PASSWORD env var is required to create a new admin account.");
    console.error("Usage: ADMIN_PASSWORD=yourSecurePassword pnpm run seed:admin");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  const [user] = await db
    .insert(usersTable)
    .values({
      email: ADMIN_EMAIL,
      passwordHash,
      name: ADMIN_NAME,
      role: "super_admin",
      subscriptionTier: "enterprise",
    })
    .returning();

  console.log(`Created super_admin account #${user.id}: ${user.email}`);
  process.exit(0);
}

seedAdmin().catch((err) => {
  console.error("Failed to seed admin:", err);
  process.exit(1);
});
