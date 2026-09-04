/**
 * Sets a user's password directly through the Supabase Admin API.
 *
 * This is the ONLY supported way to change an admin password. Every in-app
 * path was removed deliberately: the admin account page no longer has a
 * change-password form, the forced first-login page is gone, and
 * /reset-password rejects admin sessions — which also means Supabase's
 * dashboard "Send password recovery" button no longer works for an admin,
 * because its email lands on that page.
 *
 * The password is read from stdin with echo suppressed, never from argv, so
 * it never lands in shell history.
 *
 * Usage:
 *   node scripts/setAdminPassword.js --email=someone@example.com
 *   node scripts/setAdminPassword.js --email=someone@example.com --yes
 *
 * Requirements: backend/.env must have SUPABASE_URL and SUPABASE_SERVICE_KEY.
 */
import readline from "node:readline";
import { supabase } from "../supabase.js";
import { logActivity } from "../lib/auditLog.js";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback = null) => {
  const hit = args.find((arg) => arg.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
};

// The same rule the app's own password validators used, so this script can
// never set a password the app would have rejected.
const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

// supabase-js has no getUserByEmail, and listUsers() paginates — same
// approach as fetchAllAuthUsers() in routes/admin.js.
async function findUserByEmail(email) {
  const perPage = 1000;
  const needle = email.trim().toLowerCase();
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users || [];
    const hit = users.find((user) => (user.email || "").toLowerCase() === needle);
    if (hit) return hit;
    if (users.length < perPage) return null;
  }
}

function ask(query) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(query, (answer) => { rl.close(); resolve(answer); });
  });
}

// Prompts without echoing what is typed. readline writes each keystroke
// through _writeToOutput, so muting that and emitting only the trailing
// newline hides the password from the terminal.
function askHidden(query) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let muted = false;
    rl._writeToOutput = function (str) {
      if (!muted) { rl.output.write(str); return; }
      if (str.includes("\n")) rl.output.write("\n");
    };
    rl.question(query, (answer) => { rl.close(); resolve(answer); });
    muted = true;
  });
}

async function main() {
  const email = opt("email");
  if (!email) {
    console.error("Usage: node scripts/setAdminPassword.js --email=someone@example.com [--yes]");
    process.exit(1);
  }

  const user = await findUserByEmail(email);
  if (!user) {
    console.error(`No user found with email ${email}`);
    process.exit(1);
  }

  const role = user.app_metadata?.role || "(none)";
  console.log("");
  console.log("  Target user");
  console.log(`    email        ${user.email}`);
  console.log(`    role         ${role}`);
  console.log(`    id           ${user.id}`);
  console.log(`    last sign-in ${user.last_sign_in_at || "never"}`);
  console.log("");

  const password = await askHidden("  New password: ");
  const confirm = await askHidden("  Confirm:      ");
  console.log("");

  if (password !== confirm) {
    console.error("Passwords do not match — nothing changed.");
    process.exit(1);
  }
  if (!PASSWORD_RE.test(password)) {
    console.error("Password must be at least 8 characters and include a letter and a number.");
    process.exit(1);
  }

  if (!flag("yes")) {
    const answer = await ask(`  Apply this change to ${user.email}? (yes/no) `);
    if (answer.trim().toLowerCase() !== "yes") {
      console.log("Aborted — nothing changed.");
      process.exit(0);
    }
  }

  const { error } = await supabase.auth.admin.updateUserById(user.id, { password });
  if (error) {
    console.error(`Failed to update password: ${error.message}`);
    process.exit(1);
  }

  // Logged against the target user so the change shows up in their own
  // activity page. The action name records that it came from this script
  // rather than from a UI, since no UI can do this any more.
  await logActivity({
    actor: { id: user.id, email: user.email, app_metadata: user.app_metadata },
    action: "admin.password_set_by_script",
    entityType: "user",
    entityId: user.id,
    metadata: { target_email: user.email, target_role: role },
  });

  console.log(`Password updated for ${user.email}`);
  console.log("audit_log entry written (admin.password_set_by_script)");
  process.exit(0);
}

main().catch((error) => {
  console.error("setAdminPassword failed:", error.message);
  process.exit(1);
});
