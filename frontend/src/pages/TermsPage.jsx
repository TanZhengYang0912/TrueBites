import StaticPageLayout from "../components/StaticPageLayout";

function Section({ number, heading, children }) {
  return (
    <section className="flex flex-col gap-2 border-t border-sand pt-5 first:border-t-0 first:pt-0">
      <h2 className="font-display text-lg font-semibold text-ink">
        <span className="mr-2 text-terracotta">{number}.</span>
        {heading}
      </h2>
      <div className="flex flex-col gap-2.5">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <StaticPageLayout eyebrow="Legal" title="Terms and Conditions">
      <p className="text-muted">
        These terms govern your use of TrueBites, an AI-assisted food
        discovery platform for Melaka, Malaysia. By creating an account or
        browsing the site, you agree to them.
      </p>

      <Section number={1} heading="Accounts">
        <p>
          You're responsible for keeping your login credentials secure and
          for any activity under your account. Reviews, bookmarks, and other
          content you submit should reflect your own genuine experience — not
          someone else's, and not a vendor's own promotional content.
        </p>
        <p>
          You can browse the discovery grid, use the map, and build a
          browser-local trip as a guest. Bookmarking, writing reviews, and
          voting require signing in. Guest trips are cleared when you sign in,
          and account trips are cleared when you sign out or switch accounts.
        </p>
      </Section>

      <Section number={2} heading="Vendor information">
        <p>
          Vendor listings are created with the help of an AI pipeline that
          extracts names, dishes, and addresses from short-form video, and
          are reviewed by a moderator before publishing. We work to keep
          details accurate, but hours, pricing, and availability can change
          without notice, and extracted details can occasionally be wrong.
          Always confirm directly with a vendor before making firm plans
          around a listing, and let us know if something looks off.
        </p>
      </Section>

      <Section number={3} heading="User-submitted content">
        <p>
          By posting a review, photo, or other content, you grant TrueBites a
          non-exclusive license to display it on the platform. You keep
          ownership of what you post, but you're responsible for making sure
          you have the right to share it — reviews are limited to genuine
          photos you took yourself, up to four per review.
        </p>
        <p>
          All submitted content passes through automated screening —
          including profanity filtering that covers both English and local
          Malay/Manglish language — before it's visible to others. Content
          that violates our{" "}
          <a href="/guidelines" className="text-forest underline underline-offset-2">
            Rules and Guidelines
          </a>{" "}
          can be hidden by a moderator with a stated reason.
        </p>
      </Section>

      <Section number={4} heading="Account suspension">
        <p>
          Accounts that break our guidelines may be suspended by a moderator
          for a fixed period (a day, a week, a month, a year) or
          indefinitely, always with a reason you can view from your
          notifications. A suspension blocks bookmarking, reviewing, and trip
          planning — it does not block signing in or browsing, so you can
          always see why your account was suspended and for how long.
        </p>
      </Section>

      <Section number={5} heading="Account deletion">
        <p>
          You can permanently delete your account at any time from your
          profile page. Deletion removes your login and cannot be undone —
          consider exporting anything you'd want to keep first, since
          bookmarks and review authorship tied to a deleted account cannot be
          recovered.
        </p>
      </Section>

      <Section number={6} heading="Limitation of liability">
        <p>
          TrueBites is provided "as is." We don't guarantee that every
          listing is complete, current, or error-free, and we're not liable
          for decisions made based on information found here — including a
          trip built with our route-planning tools.
        </p>
      </Section>

      <Section number={7} heading="Changes to these terms">
        <p>
          We may update these terms as the platform evolves. Continued use of
          TrueBites after a change means you accept the updated terms.
          Material changes will be reflected on this page.
        </p>
      </Section>

      <p className="text-muted">
        These terms are governed by the laws of Malaysia. Last reviewed:
        2026.
      </p>
    </StaticPageLayout>
  );
}
