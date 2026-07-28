"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Code2,
  EyeOff,
  LockKeyhole,
  Megaphone,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";
import { FormEvent, useState } from "react";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

const providers = [
  { label: "X", state: "Live", className: "provider-x" },
  { label: "YouTube", state: "Next", className: "provider-youtube" },
  { label: "Instagram", state: "Planned", className: "provider-instagram" },
  { label: "Spotify", state: "Planned", className: "provider-spotify" },
  { label: "GitHub", state: "Planned", className: "provider-github" },
] as const;

const proofSteps = [
  {
    number: "01",
    title: "Choose a real moment",
    text: "Paste the original X post you liked and replied to.",
  },
  {
    number: "02",
    title: "Verify with Reclaim",
    text: "Approve the check in Reclaim. Early never receives your password.",
  },
  {
    number: "03",
    title: "Keep it public or private",
    text: "Create a Base receipt, or seal the discovery inside your encrypted vault.",
  },
] as const;

const faqs = [
  {
    question: "What counts as an X proof?",
    answer:
      "Use a public X post where the same account both liked the post and replied directly to it. Early verifies the focal post, liked state, reply relationship, and reply time.",
  },
  {
    question: "What is public on Base?",
    answer:
      "The public receipt stores only your wallet, proof ID, platform, hashed subject and content IDs, provider hash, and verification time. The selected proof fields are still visible in transaction calldata.",
  },
  {
    question: "What stays private in the vault?",
    answer:
      "Your accumulated discovery timing and interaction counts remain encrypted. A campaign can reveal an eligibility result without publishing the history used to compute it.",
  },
  {
    question: "Does Early see my data?",
    answer:
      "Reclaim verifies the source without sharing your password. In V2, Early's attestor sees the verified plaintext before encrypting a private vault input. Brands and public observers do not.",
  },
  {
    question: "Which platforms work today?",
    answer:
      "X is the first live provider. YouTube is the next production provider, followed by more cultural and developer platforms.",
  },
] as const;

function TimelineSignal() {
  const bars = [8, 10, 9, 12, 11, 15, 18, 23, 31, 44, 62, 79, 92];
  return (
    <div className="hero-signal" aria-label="Attention rising after an early interaction">
      <div className="signal-label signal-label-you">
        <span>You were here</span>
        <i />
      </div>
      <div className="signal-bars" aria-hidden="true">
        {bars.map((height, index) => (
          <motion.i
            key={`${height}-${index}`}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ delay: 0.4 + index * 0.045, duration: 0.45 }}
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
      <div className="signal-baseline" />
      <div className="sealed-receipt">
        <span className="receipt-seal">
          <Check size={15} strokeWidth={3} />
        </span>
        <div>
          <small>VERIFIED DISCOVERY</small>
          <strong>Before the attention spike</strong>
        </div>
      </div>
    </div>
  );
}

function ProofPath() {
  return (
    <div className="path-comparison">
      <article>
        <span className="path-icon public">
          <ShieldCheck size={20} />
        </span>
        <small>PUBLIC RECEIPT</small>
        <h3>A fact anyone can check.</h3>
        <p>Reclaim verification and receipt creation happen in one Base transaction.</p>
        <div className="artifact-code">
          <span>subject</span>
          <code>0x89d4...e21a</code>
        </div>
      </article>
      <div className="path-divider" aria-hidden="true">
        <span>or</span>
      </div>
      <article>
        <span className="path-icon private">
          <LockKeyhole size={20} />
        </span>
        <small>PRIVATE VAULT</small>
        <h3>A history nobody can browse.</h3>
        <p>Zama computes campaign eligibility over encrypted discovery data.</p>
        <div className="encrypted-line" aria-label="Encrypted proof artifact">
          <i />
          <i />
          <i />
          <i />
          <i />
          <strong>eligible</strong>
        </div>
      </article>
    </div>
  );
}

export function LandingPage() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [xUrl, setXUrl] = useState("");
  const [openFaq, setOpenFaq] = useState(0);
  const [error, setError] = useState("");

  function beginProof(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/(?:x\.com|twitter\.com)\/[^/]+\/status\/\d+/i.test(xUrl.trim())) {
      setError("Paste the URL of the original X post.");
      return;
    }
    setError("");
    router.push(`/proof?url=${encodeURIComponent(xUrl.trim())}`);
  }

  return (
    <main>
      <SiteHeader />

      <section className="hero" id="top">
        <div className="site-container hero-layout">
          <motion.div
            className="hero-copy"
            initial={reduceMotion ? false : { opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65 }}
          >
            <span className="eyebrow">
              <i />
              Proof of discovery
            </span>
            <h1>
              Being early used to be a story. <em>Now it&apos;s proof.</em>
            </h1>
            <p>
              Prove you liked and replied before the crowd arrived. Keep the
              moment as a public receipt or a private signal.
            </p>
            <form className="hero-form" onSubmit={beginProof}>
              <label htmlFor="x-url">X post URL</label>
              <div>
                <span aria-hidden="true">X</span>
                <input
                  id="x-url"
                  value={xUrl}
                  onChange={(event) => setXUrl(event.target.value)}
                  placeholder="https://x.com/creator/status/..."
                  autoComplete="url"
                />
                <button type="submit" aria-label="Create an X proof">
                  Create proof
                  <ArrowRight size={17} />
                </button>
              </div>
              {error && <p role="alert">{error}</p>}
            </form>
            <div className="hero-trust">
              <span>Verified with Reclaim</span>
              <i />
              <span>Public on Base</span>
              <i />
              <span>Private with Zama</span>
            </div>
          </motion.div>
          <motion.div
            className="hero-visual"
            initial={reduceMotion ? false : { opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.75, delay: 0.12 }}
          >
            <TimelineSignal />
          </motion.div>
        </div>
      </section>

      <section className="provider-timeline" aria-labelledby="provider-title">
        <div className="site-container">
          <div className="section-intro compact">
            <span>THE DISCOVERY LAYER</span>
            <h2 id="provider-title">Culture happens everywhere.</h2>
          </div>
          <div className="provider-line">
            {providers.map((provider, index) => (
              <motion.div
                key={provider.label}
                className={`provider-stop ${provider.className}`}
                initial={reduceMotion ? false : { opacity: 0, x: 28 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.5 }}
                transition={{ delay: index * 0.08 }}
              >
                <i />
                <strong>{provider.label}</strong>
                <small>{provider.state}</small>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="how" id="how">
        <div className="site-container">
          <div className="section-intro">
            <span>HOW EARLY WORKS</span>
            <h2>One moment. Three steps.</h2>
          </div>
          <div className="steps">
            {proofSteps.map((step, index) => (
              <motion.article
                key={step.number}
                initial={reduceMotion ? false : { opacity: 0, x: 70 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.55 }}
                transition={{ duration: 0.55, delay: index * 0.07 }}
              >
                <span>{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
                <div className={`step-demo step-demo-${index + 1}`}>
                  {index === 0 && (
                    <>
                      <span>X</span>
                      <code>x.com/artist/status/...</code>
                      <Check size={16} />
                    </>
                  )}
                  {index === 1 && (
                    <>
                      <span>R</span>
                      <i />
                      <strong>Source verified</strong>
                    </>
                  )}
                  {index === 2 && (
                    <>
                      <ShieldCheck size={18} />
                      <i />
                      <LockKeyhole size={18} />
                    </>
                  )}
                </div>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      <section className="proof-paths" id="privacy">
        <div className="site-container">
          <div className="section-intro inverse">
            <span>TWO WAYS TO KEEP THE MOMENT</span>
            <h2>Publish the proof. Not the whole story.</h2>
          </div>
          <ProofPath />
        </div>
      </section>

      <section className="culture-examples">
        <div className="site-container">
          <div className="section-intro">
            <span>WHY THIS EXISTS</span>
            <h2>The internet already speaks in day-one receipts.</h2>
          </div>
          <div className="culture-rail">
            <figure>
              <Image
                src="/creator-day-one-backstage.jpg"
                alt="Creator promising a backstage pass to day-one fans"
                width={900}
                height={697}
              />
              <figcaption>Day-one fans deserve more than a screenshot.</figcaption>
            </figure>
            <figure>
              <Image
                src="/creator-art-before-famous.jpg"
                alt="Artist sharing work before becoming famous"
                width={620}
                height={874}
              />
              <figcaption>The artist before the audience arrived.</figcaption>
            </figure>
            <figure>
              <Image
                src="/creator-free-ticket.jpg"
                alt="Band offering future tickets to early supporters"
                width={900}
                height={463}
              />
              <figcaption>A promise that can become a campaign rule.</figcaption>
            </figure>
          </div>
        </div>
      </section>

      <section className="teams" id="teams">
        <div className="site-container">
          <div className="section-intro">
            <span>FOR TEAMS</span>
            <h2>Turn early attention into something useful.</h2>
          </div>
          <div className="team-rows">
            <article>
              <span>
                <Sparkles size={20} />
              </span>
              <h3>Creators</h3>
              <p>Recognize day-one fans with access, tickets, and loyalty.</p>
              <ArrowRight size={18} />
            </article>
            <article>
              <span>
                <Megaphone size={20} />
              </span>
              <h3>Brands</h3>
              <p>Run campaigns using verified timing instead of screenshots.</p>
              <ArrowRight size={18} />
            </article>
            <LinkRow />
          </div>
        </div>
      </section>

      <section className="privacy-note">
        <div className="site-container privacy-note-layout">
          <div className="privacy-orbit" aria-hidden="true">
            <span>
              <EyeOff size={19} />
            </span>
            <i />
            <strong>?</strong>
          </div>
          <div>
            <span>THE PRIVACY BOUNDARY</span>
            <h2>Your login stays yours.</h2>
            <p>
              Reclaim proves the required fact. Zama keeps the accumulated
              history encrypted. Early states exactly what each path reveals.
            </p>
          </div>
        </div>
      </section>

      <section className="faq" id="faq">
        <div className="site-container faq-layout">
          <div className="section-intro">
            <span>FAQ</span>
            <h2>Before you prove it.</h2>
          </div>
          <div className="faq-list">
            {faqs.map((faq, index) => {
              const isOpen = openFaq === index;
              return (
                <article key={faq.question}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpenFaq(isOpen ? -1 : index)}
                  >
                    <span>{faq.question}</span>
                    <ChevronDown
                      size={18}
                      className={isOpen ? "is-open" : ""}
                    />
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.p
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                      >
                        {faq.answer}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

function LinkRow() {
  return (
    <a href="/developers">
      <span>
        <Code2 size={20} />
      </span>
      <h3>Developers</h3>
      <p>Use versioned providers, contracts, and portable receipt schemas.</p>
      <ArrowRight size={18} />
    </a>
  );
}
