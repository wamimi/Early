import { CampaignBuilder } from "@/components/campaign-builder";
import { CampaignList } from "@/components/campaign-list";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function CampaignsPage() {
  return (
    <main className="product-main">
      <SiteHeader />
      <section className="product-page">
        <div className="site-container">
          <div className="product-heading">
            <div>
              <span>FOR CREATORS AND BRANDS</span>
              <h1>Reward the people who arrived early.</h1>
              <p>
                Define a subject and eligibility window. Zama evaluates private
                vaults and reveals only the final result.
              </p>
            </div>
          </div>
          <CampaignBuilder />
          <CampaignList />
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
