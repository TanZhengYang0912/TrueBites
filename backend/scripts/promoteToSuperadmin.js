import { supabase } from "../supabase.js";

const EMAIL = "admin@gmail.com";

async function main() {
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) {
    console.error("Failed to list users:", error.message);
    process.exit(1);
  }

  const existing = data.users.find((u) => u.email?.toLowerCase() === EMAIL);
  if (!existing) {
    console.log(`User ${EMAIL} not found.`);
    process.exit(1);
  }

  const { data: updated, error: updateError } = await supabase.auth.admin.updateUserById(
    existing.id,
    { app_metadata: { ...existing.app_metadata, role: "superadmin" } }
  );

  if (updateError) {
    console.error("Failed to promote user:", updateError.message);
    process.exit(1);
  }

  console.log(`Successfully promoted ${EMAIL} to superadmin! Please log out and log back in.`);
}

main();
