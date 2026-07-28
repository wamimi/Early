import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-container footer-grid">
        <div>
          <Link className="brand" href="/">
            <span className="brand-mark" aria-hidden="true">
              <i />
            </span>
            <strong>Early</strong>
          </Link>
          <p>Verifiable proof that you were there early.</p>
        </div>
        <nav aria-label="Product">
          <strong>Product</strong>
          <Link href="/proof">Create proof</Link>
          <Link href="/vault">Private vault</Link>
          <Link href="/campaigns">Campaigns</Link>
        </nav>
        <nav aria-label="Build">
          <strong>Build</strong>
          <Link href="/developers">Developers</Link>
          <a href="https://reclaimprotocol.org" target="_blank" rel="noreferrer">
            Reclaim
          </a>
          <a href="https://www.zama.ai" target="_blank" rel="noreferrer">
            Zama
          </a>
        </nav>
        <nav aria-label="Project">
          <strong>Project</strong>
          <a href="https://github.com" target="_blank" rel="noreferrer">
            GitHub
          </a>
          <Link href="/developers#license">Apache 2.0</Link>
        </nav>
      </div>
      <div className="site-container footer-bottom">
        <span>Early 2026</span>
        <span>Base Sepolia + Zama Sepolia</span>
      </div>
    </footer>
  );
}
