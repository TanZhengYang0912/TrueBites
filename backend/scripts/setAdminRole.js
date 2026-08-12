// One-off utility — grants an existing user the "admin" role by setting
// app_metadata.role, which only the service key can write. Run with:
//   node scripts/setAdminRole.js someone@example.com
import { supabase } from "../supabase.js";

const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/setAdminRole.js <email>");
  process.exit(1);
}

async function main() {
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) {
    console.error("Failed to list users:", error.message);
    process.exit(1);
  }

  const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    console.error(`No user found with email ${email}. They must sign up first.`);
    process.exit(1);
  }

  const { data: updated, error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
    app_metadata: { ...user.app_metadata, role: "admin" },
  });
  if (updateError) {
    console.error("Failed to update role:", updateError.message);
    process.exit(1);
  }

  console.log(`${email} (id: ${updated.user.id}) now has role: ${updated.user.app_metadata.role}`);
}

main();
