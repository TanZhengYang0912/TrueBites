import { Camera, Flag, MessageSquareWarning, ShieldCheck, UserCheck } from "lucide-react";
import StaticPageLayout from "../components/StaticPageLayout";

function Rule({ icon: Icon, title, children }) {
  return (
    <div className="flex gap-3 rounded border border-sand bg-white p-4">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-chalk text-forest">
        <Icon size={15} />
      </span>
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-base font-semibold text-ink">{title}</h2>
        <p className="text-[14px] text-ink/75">{children}</p>
      </div>
    </div>
  );
}

export default function GuidelinesPage() {
  return (
    <StaticPageLayout eyebrow="Community" title="Rules and Guidelines">
      <p>
        TrueBites works because people trust what they read here. These
        guidelines keep reviews, photos, and listings useful for everyone —
        please read them before posting.
      </p>

      <div className="flex flex-col gap-3">
        <Rule icon={UserCheck} title="Be honest">
          Reviews should reflect a genuine visit and your real experience.
          Don't post on a vendor's behalf, don't review a place you haven't
          been to, and don't use reviews to settle a personal dispute.
        </Rule>
        <Rule icon={ShieldCheck} title="Be respectful">
          Disagree with a vendor or another user without personal attacks,
          harassment, or discriminatory language. Every review passes through
          automated profanity filtering — covering English and local
          Malay/Manglish language, including common misspellings — but the
          spirit of the rule matters more than what the filter catches.
        </Rule>
        <Rule icon={Camera} title="Keep photos real and relevant">
          Upload photos you took yourself of the food, the venue, or the
          experience you're reviewing — up to four per review. No stock
          photos, no images pulled from elsewhere online, no unrelated or
          offensive content.
        </Rule>
        <Rule icon={MessageSquareWarning} title="No spam or self-promotion">
          Don't use reviews or bookmarks to advertise unrelated services,
          repost the same review across multiple vendors, or coordinate votes
          to manipulate a rating.
        </Rule>
        <Rule icon={Flag} title="Report, don't retaliate">
          If you see a listing or review that breaks these rules, report it
          rather than responding in kind. Our moderation team reviews reports
          and takes action where needed.
        </Rule>
      </div>

      <div className="flex flex-col gap-2 rounded border border-sand bg-chalk p-4">
        <h2 className="font-display text-base font-semibold text-ink">A note on privacy</h2>
        <p className="text-[14px] text-ink/75">
          Want feedback to stay candid without your name attached? Reviews
          can be posted anonymously — your account is still tied to the
          review for moderation purposes, but your name won't be shown
          publicly.
        </p>
      </div>

      <p>
        Accounts that repeatedly break these guidelines may be suspended —
        for a set period or indefinitely — with a reason you can view from
        your notifications. A suspension blocks saving, reviewing, and trip
        planning, but you can still sign in and see exactly why.
      </p>

      <p className="text-muted">
        Questions about a moderation decision? Reach out through{" "}
        <a href="/contact" className="text-forest underline underline-offset-2">
          Contact Us
        </a>
        .
      </p>
    </StaticPageLayout>
  );
}
