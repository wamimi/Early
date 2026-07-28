import { ProofConsole } from "@/components/proof-console";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

type ProofPageProps = {
  searchParams: Promise<{
    url?: string;
    sessionId?: string;
  }>;
};

export default async function ProofPage({ searchParams }: ProofPageProps) {
  const query = await searchParams;

  return (
    <main className="product-main">
      <SiteHeader />
      <section className="product-page">
        <div className="site-container">
          <div className="product-heading">
            <div>
              <span>PROOF CONSOLE / X</span>
              <h1>Turn an early moment into proof.</h1>
              <p>
                Paste the original X post. Your account must have liked it and
                replied to it.
              </p>
            </div>
          </div>
          <ProofConsole
            initialSessionId={query.sessionId ?? ""}
            initialUrl={query.url ?? ""}
          />
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
