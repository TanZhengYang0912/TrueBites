import DiscoveryHeader from "./DiscoveryHeader";
import Footer from "../Footer";

const MAIN_CLASS = "mx-auto w-full max-w-[1360px] px-4 pb-16 pt-8 md:px-6 md:pb-18 md:pt-12 xl:px-10";

export default function DiscoveryPageShell({ headerProps, children, mainClassName = "" }) {
  return (
    <div className="min-h-dvh bg-chalk font-body text-ink">
      <DiscoveryHeader {...headerProps} />
      <main className={`${MAIN_CLASS} ${mainClassName}`.trim()}>
        {children}
      </main>
      <Footer />
    </div>
  );
}
