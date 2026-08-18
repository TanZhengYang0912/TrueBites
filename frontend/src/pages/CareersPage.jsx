import { BrainCircuit, Compass, MapPinned, MessageSquareHeart, ShieldCheck } from "lucide-react";
import StaticPageLayout from "../components/StaticPageLayout";

function Discipline({ icon: Icon, title, children }) {
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

export default function CareersPage() {
  return (
    <StaticPageLayout eyebrow="Join us" title="Careers">
      <p>
        TrueBites is built by a small team spread across a few disciplines —
        part mapping and navigation, part AI content pipeline, part
        community moderation, part plain old love for Melaka's food scene.
      </p>

      <div className="flex flex-col gap-3">
        <Discipline icon={MapPinned} title="Map & Navigation">
          The discovery map, proximity search, and multi-stop trip planning
          with real turn-by-turn directions.
        </Discipline>
        <Discipline icon={ShieldCheck} title="Accounts & Trust">
          Sign-in, onboarding, and the moderation tools that keep the
          platform's content trustworthy — including account suspension and
          review moderation.
        </Discipline>
        <Discipline icon={Compass} title="Vendor Discovery">
          The vendor directory itself — listings, categories, duplicate
          detection, and the admin console that keeps them accurate.
        </Discipline>
        <Discipline icon={BrainCircuit} title="AI Content Pipeline">
          Turning a creator's video into a structured, reviewable vendor
          draft — transcription, extraction, and photo sourcing.
        </Discipline>
        <Discipline icon={MessageSquareHeart} title="Community & Engagement">
          Bookmarks, folders, reviews, and everything that makes TrueBites
          feel personal rather than just a directory.
        </Discipline>
      </div>

      <p>
        We're not actively hiring right now — TrueBites is still a young,
        actively-developed project — but if one of those disciplines is your
        thing and you'd like to help build a better food map of Melaka, we'd
        like to hear from you.
      </p>

      <p className="text-muted">
        This page is a placeholder — reach out via{" "}
        <a href="/contact" className="text-forest underline underline-offset-2">
          Contact Us
        </a>{" "}
        in the meantime; a real application process is still being set up.
      </p>
    </StaticPageLayout>
  );
}
