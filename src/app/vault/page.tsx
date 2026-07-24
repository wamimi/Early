import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { VaultView } from "@/components/vault-view";

export default function VaultPage() {
  return (
    <main className="product-main">
      <SiteHeader />
      <section className="product-page">
        <div className="site-container">
          <div className="product-heading">
            <div>
              <span>PRIVATE DISCOVERY VAULT</span>
              <h1>Proof without a public history.</h1>
              <p>
                Encrypted artifacts can be evaluated for campaign eligibility
                without revealing the discoveries inside your vault.
              </p>
            </div>
          </div>
          <VaultView />
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
