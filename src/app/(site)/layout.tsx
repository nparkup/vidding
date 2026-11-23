import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteBanner } from "@/components/Cfg";
import { PageReset } from "@/components/PageReset";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteBanner />
      <SiteHeader />
      <main>
        <PageReset>{children}</PageReset>
      </main>
      <SiteFooter />
    </>
  );
}
