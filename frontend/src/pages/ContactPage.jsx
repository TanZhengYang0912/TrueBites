import { Mail, MapPin, ShieldQuestion, Store } from "lucide-react";
import StaticPageLayout from "../components/StaticPageLayout";

function ContactCard({ icon: Icon, label, value, note }) {
  return (
    <div className="flex items-start gap-3 rounded border border-sand bg-white p-4">
      <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-chalk text-forest">
        <Icon size={16} />
      </span>
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{label}</div>
        <div className="text-[14.5px] font-medium text-ink">{value}</div>
        {note && <div className="mt-0.5 text-[12.5px] text-muted">{note}</div>}
      </div>
    </div>
  );
}

export default function ContactPage() {
  return (
    <StaticPageLayout eyebrow="Get in touch" title="Contact Us">
      <p>
        Found a wrong address, want to appeal a moderation decision, or just
        have a question about how TrueBites works? Here's how to reach us.
      </p>

      <div className="flex flex-col gap-3">
        <ContactCard
          icon={Mail}
          label="General support"
          value="hello@truebites.my"
          note="Bugs, feedback, and anything that doesn't fit the categories below."
        />
        <ContactCard
          icon={ShieldQuestion}
          label="Moderation & account appeals"
          value="trust@truebites.my"
          note="Think a review was hidden, or an account suspended, in error? Include your account email and we'll take a look."
        />
        <ContactCard
          icon={Store}
          label="Vendor & business inquiries"
          value="vendors@truebites.my"
          note="Run a stall or restaurant in Melaka and want to be listed, or need a correction to your listing?"
        />
        <ContactCard
          icon={MapPin}
          label="Where we cover"
          value="Melaka, Malaysia"
          note="TrueBites currently focuses on vendors within Melaka's city boundaries."
        />
      </div>

      <p className="text-muted">
        We aim to respond within a few working days. This page is a
        placeholder — live inboxes and a proper contact form are still being
        set up.
      </p>
    </StaticPageLayout>
  );
}
