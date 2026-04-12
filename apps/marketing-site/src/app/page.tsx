import { AmbientGrid } from "@/components/sections/ambient-grid";
import { DataStream } from "@/components/sections/data-stream";
import { FinalCta } from "@/components/sections/final-cta";
import { FloatingDataObjects } from "@/components/sections/floating-data-objects";
import { Footer } from "@/components/sections/footer";
import { Hero } from "@/components/sections/hero";
import { Navbar } from "@/components/sections/navbar";
import { ProductPillars } from "@/components/sections/product-pillars";
import { ProductShowcase } from "@/components/sections/product-showcase";
import { SocialProof } from "@/components/sections/social-proof";
import { TrustStrip } from "@/components/sections/trust-strip";
import { UseCases } from "@/components/sections/use-cases";
import { WhyDifferent } from "@/components/sections/why-different";

export default function Home(): JSX.Element {
  return (
    <>
      <AmbientGrid />
      <FloatingDataObjects />
      <Navbar />
      <main id="main-content">
        <Hero />
        <TrustStrip />
        <DataStream />
        <ProductPillars />
        <ProductShowcase />
        <UseCases />
        <WhyDifferent />
        <SocialProof />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
