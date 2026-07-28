"use client";

import Link from "next/link";
import { LogOut, Menu, X } from "lucide-react";
import { useState } from "react";
import { useEarlyAuth } from "./early-auth";

const links = [
  { label: "How it works", href: "/#how" },
  { label: "For teams", href: "/#teams" },
  { label: "Vault", href: "/vault" },
  { label: "Developers", href: "/developers" },
] as const;

export function SiteHeader() {
  const auth = useEarlyAuth();
  const [open, setOpen] = useState(false);

  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label="Early home">
        <span className="brand-mark" aria-hidden="true">
          <i />
        </span>
        <strong>Early</strong>
      </Link>

      <nav className={open ? "site-nav is-open" : "site-nav"} aria-label="Main navigation">
        {links.map((link) => (
          <Link key={link.href} href={link.href} onClick={() => setOpen(false)}>
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="header-actions">
        {auth.authenticated ? (
          <>
            <Link className="button button-small button-dark" href="/proof">
              Create proof
            </Link>
            <button
              className="icon-button"
              type="button"
              onClick={() => void auth.logout()}
              aria-label="Log out"
              title="Log out"
            >
              <LogOut size={18} />
            </button>
          </>
        ) : (
          <button
            className="button button-small button-dark"
            type="button"
            onClick={auth.login}
            disabled={!auth.ready}
          >
            {auth.ready ? "Sign in" : "Loading"}
          </button>
        )}
        <button
          className="menu-button"
          type="button"
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
    </header>
  );
}
