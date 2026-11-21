import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteBanner } from "@/components/Cfg";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteBanner />
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </>
  );
}
