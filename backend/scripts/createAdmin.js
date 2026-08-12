// One-off utility — creates a brand-new account with the "admin" role set
// from the start, bypassing the public signup form entirely. Run with:
//   node scripts/createAdmin.js someone@example.com theirPassword
import { supabase } from "../supabase.js";

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error("Usage: node scripts/createAdmin.js <email> <password>");
  process.exit(1);
}

async function main() {
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) {
    console.error("Failed to list users:", error.message);
    process.exit(1);
  }

  const existing = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (existing) {
    console.error(`${email} already exists (id: ${existing.id}). Use setAdminRole.js to change their role instead.`);
    process.exit(1);
  }

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: "admin" },
  });
  if (createError) {
    console.error("Failed to create admin:", createError.message);
    process.exit(1);
  }

  console.log(`Created admin ${email} (id: ${created.user.id}).`);
}

main();
