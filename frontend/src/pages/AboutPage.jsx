import StaticPageLayout from "../components/StaticPageLayout";

function Section({ heading, children }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="font-display text-xl font-semibold text-forest">{heading}</h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Stat({ value, label }) {
  return (
    <div className="flex flex-col gap-0.5 rounded border border-sand bg-white px-4 py-3">
      <span className="font-display text-2xl font-semibold text-terracotta">{value}</span>
      <span className="text-[12px] uppercase tracking-[0.06em] text-muted">{label}</span>
    </div>
  );
}

export default function AboutPage() {
  return (
    <StaticPageLayout eyebrow="Our Story" title="About Us">
      <p>
        Melaka's food culture is a living archive — a flavour record written
        by Malay sultans, Dutch traders, Portuguese explorers, and the
        Peranakan Baba-Nyonya community who wove them all together over six
        centuries. Most of that record isn't in restaurant guides. It's
        behind unmarked shopfronts, on hand-painted signboards, in kopitiams
        that have been open since before the street had a name — the kind of
        places tourists walk past every day without knowing the story hiding
        behind the door.
      </p>
      <p>
        TrueBites exists to surface those stories properly: with a real
        location, real hours, and real context, instead of letting them stay
        a secret only locals know.
      </p>

      <div className="grid grid-cols-3 gap-3">
        <Stat value="600+" label="Years of heritage" />
        <Stat value="14" label="Ethnic cuisines" />
        <Stat value="UNESCO" label="World Heritage City" />
      </div>

      <Section heading="How a listing gets on TrueBites">
        <p>
          Every vendor starts life as a video — a TikTok or YouTube clip from
          a creator who's actually eaten there. Our AI pipeline transcribes
          the audio, summarises what's being said, and extracts structured
          details: the vendor's name, its dishes, and its address, checked
          against Melaka's boundaries so nothing outside the city sneaks in.
          The same video is scanned frame by frame for usable photos of the
          food and storefront.
        </p>
        <p>
          None of that goes live on its own. Every AI-extracted listing lands
          in an admin queue as a <em>draft</em> — checked for duplicates,
          corrected where the extraction got something wrong, and only
          published once a human is satisfied it's accurate. Listings can
          also be suspended later if something changes.
        </p>
      </Section>

      <Section heading="Where the photos come from">
        <p>
          Because we don't rely on paid mapping APIs, vendor photos are
          sourced from a chain of free, publicly available providers —
          street-level imagery, food and interior shots from photo-sharing
          communities, frames pulled from the source video itself, video
          thumbnails, and Wikimedia Commons as a last resort. An admin can
          always step in and upload a photo by hand when automation doesn't
          find a good match.
        </p>
      </Section>

      <Section heading="What you can do here">
        <p>
          Browse the discovery grid or the interactive map, filter by
          cuisine or by the creator who found the place, and bookmark
          favourites into folders you name yourself. Signed-in users can
          write star-rated reviews with up to four photos and vote on reviews
          they find helpful. Everyone, including guests, can plan a
          browser-local multi-stop trip across Melaka with real turn-by-turn
          directions; signing in, signing out, or switching accounts starts a
          fresh trip so plans never leak between identities.
        </p>
      </Section>

      <Section heading="Kept honest by moderation">
        <p>
          A content moderation team reviews vendor submissions, checks
          reviews for spam and profanity (in English and local Manglish
          slang), and can hide content or suspend an account — always with a
          stated reason — when our guidelines aren't followed. You can read
          the details on our{" "}
          <a href="/guidelines" className="text-forest underline underline-offset-2">
            Rules and Guidelines
          </a>{" "}
          page.
        </p>
      </Section>

      <p className="text-muted">
        TrueBites is an ongoing project, actively built and moderated rather
        than a finished product — expect it to keep growing alongside
        Melaka's food scene.
      </p>
    </StaticPageLayout>
  );
}
