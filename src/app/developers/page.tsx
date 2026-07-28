import { ArrowUpRight } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

const registryAddress =
  process.env.NEXT_PUBLIC_BASE_REGISTRY_ADDRESS ?? "Deploy registry to populate";
const vaultAddress =
  process.env.NEXT_PUBLIC_ZAMA_VAULT_ADDRESS ?? "Deploy vault to populate";

export default function DevelopersPage() {
  return (
    <main className="product-main">
      <SiteHeader />
      <section className="product-page">
        <div className="site-container">
          <div className="product-heading">
            <div>
              <span>EARLY PROTOCOL / V2</span>
              <h1>Build with verified discovery.</h1>
              <p>
                Reuse Early’s versioned provider schemas, Base registry, and
                private eligibility boundary without rebuilding the zkTLS flow.
              </p>
            </div>
          </div>

          <div className="developer-sections">
            <section className="developer-section">
              <h2>Provider schema</h2>
              <div>
                <p>
                  A provider must bind the authenticated account, focal subject,
                  required interaction, relationship, and timestamp. Every
                  configuration is versioned and allowlisted by hash.
                </p>
                <pre className="code-block">
                  <code>{`type VerifiedDiscovery = {
  platform: "x" | "youtube";
  provider: { id: string; version: string; hash: bytes32 };
  proofIdentifier: bytes32;
  sessionNullifier: bytes32;
  wallet: address;
  subject: string;
  content: string;
  timestamp: number;
  commitment: bytes32;
};`}</code>
                </pre>
              </div>
            </section>

            <section className="developer-section">
              <h2>Public registry</h2>
              <div>
                <p>
                  `verifyAndRegister` calls Reclaim’s verifier and creates the
                  receipt atomically. There is no externally callable publish
                  function that can bypass verification.
                </p>
                <pre className="code-block">
                  <code>{`const registry = new Contract(
  "${registryAddress}",
  EARLY_DISCOVERY_REGISTRY_ABI,
  signer
);

await registry.verifyAndRegister(reclaimProof);`}</code>
                </pre>
              </div>
            </section>

            <section className="developer-section">
              <h2>Private eligibility</h2>
              <div>
                <p>
                  Early’s attestor verifies plaintext in V2, derives the exact
                  encrypted update, and signs an EIP-712 attestation for the
                  Zama vault. Consumers receive only an expiring claim
                  authorization.
                </p>
                <div className="contract-addresses">
                  <div>
                    <span>Base registry</span>
                    <code>{registryAddress}</code>
                  </div>
                  <div>
                    <span>Zama vault</span>
                    <code>{vaultAddress}</code>
                  </div>
                </div>
              </div>
            </section>

            <section className="developer-section">
              <h2>Trust boundary</h2>
              <div>
                <p>
                  Public receipts expose selected proof fields in transaction
                  calldata. Private vault proofs do not go to Base, but the
                  Early attestor sees verified plaintext before encryption.
                  FHE protects the accumulated history and campaign
                  computation.
                </p>
                <a
                  className="text-link developer-link"
                  href="https://docs.reclaimprotocol.org/onchain/solidity/supported-networks"
                  target="_blank"
                  rel="noreferrer"
                >
                  Reclaim supported networks
                  <ArrowUpRight size={15} />
                </a>
              </div>
            </section>

            <section className="developer-section" id="license">
              <h2>License</h2>
              <div>
                <p>
                  Early’s first-party source is licensed under Apache License
                  2.0. Third-party dependencies retain their respective
                  licenses.
                </p>
              </div>
            </section>
          </div>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
