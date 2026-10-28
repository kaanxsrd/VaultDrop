import { MotionProvider } from "@/components/motion/primitives";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="flex-1">
        <MotionProvider>{children}</MotionProvider>
      </main>
      <SiteFooter />
    </div>
  );
}
