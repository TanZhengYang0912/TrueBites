import { ShieldAlert } from "lucide-react";
import { useSession } from "../../lib/SessionContext";
import { hasPermission } from "../../lib/roles";

// Backs up the sidebar's grey-out — a restricted admin who types the URL
// directly (bypassing the disabled nav tab) still can't see the page content.
export default function RequireTabAccess({ permission, children }) {
  const { session } = useSession();
  if (!hasPermission(session, permission)) {
    return (
      <div className="admin-feedback error">
        <ShieldAlert size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} />
        Your moderator has disabled access for this function. Please contact your moderator to gain access.
      </div>
    );
  }
  return children;
}
