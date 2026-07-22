"use client";

/* eslint-disable @next/next/no-img-element */

import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll } from "framer-motion";
import { useEffect, useRef, useState, type FormEvent } from "react";
import clsx from "clsx";

type LandingPageProps = {
  tweetUrl: string;
  setTweetUrl: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  proofError: string;
};

type ProviderName = "X" | "YouTube" | "Instagram" | "Spotify" | "GitHub";

const providers = [
  { name: "X", status: "Live", icon: "https://cdn.simpleicons.org/x/111411" },
  { name: "YouTube", status: "Soon", icon: "https://cdn.simpleicons.org/youtube/FF0033" },
  { name: "Instagram", status: "Soon", icon: "https://cdn.simpleicons.org/instagram/E4405F" },
  { name: "Spotify", status: "Soon", icon: "https://cdn.simpleicons.org/spotify/1ED760" },
  { name: "GitHub", status: "Soon", icon: "https://cdn.simpleicons.org/github/111411" }
] as const;

const rotatingLines = [
  "Now it's proof.",
  "Now it's valuable.",
  "Now it's rewarded.",
  "Now it's portable."
] as const;

const faqs = [
  {
    question: "What does Early prove?",
    answer: "Early proves that your account interacted with content at a real time. On X, the first live provider verifies that you liked and replied to the original post."
  },
  {
    question: "What do I get from a proof?",
    answer: "A proof becomes part of your Early profile. It can build discovery reputation and qualify you for creator access, brand campaigns, and rewards as those programs launch."
  },
  {
    question: "How is my privacy protected?",
    answer: "Reclaim verifies the required fact from your authenticated session without giving Early your password. Zama can compute reputation or eligibility from encrypted proof history."
  },
  {
    question: "Is the Reclaim Verifier safe?",
    answer: "The verification happens through Reclaim's verifier flow. Early receives the verified claim needed for the proof, not your full account session or browsing history."
  },
  {
    question: "Which platforms are supported?",
    answer: "X is live first. YouTube, Instagram, Spotify, and GitHub are the next provider surfaces planned for Early."
  }
] as const;

const howSteps = [
  {
    number: "01",
    title: "Install Reclaim",
    description: "Get Reclaim Verifier from the App Store or Play Store. It checks the fact you approve on your phone, without sharing your password with Early.",
    visual: "reclaim"
  },
  {
    number: "02",
    title: "Choose a platform",
    description: "Pick where your early moment happened and select what you want to prove. X is live first, with more providers on the way.",
    visual: "providers"
  },
  {
    number: "03",
    title: "Keep the proof",
    description: "Your verified moment joins your discovery profile, ready to become reputation, access, campaign eligibility, or rewards.",
    visual: "value"
  }
] as const;

function PlatformIcon({ name, icon }: { name: string; icon: string }) {
  return <img src={icon} alt={`${name} logo`} />;
}

function HeroSignal() {
  const bars = [18, 22, 19, 25, 29, 26, 34, 39, 44, 41, 50, 58, 62, 71, 78, 86];

  return (
    <motion.div
      className="vision-signal"
      initial={{ opacity: 0.8, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.85, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
      aria-label="A visual showing one person arriving before wider attention"
    >
      <div className="signal-topline"><span>Discovery</span><strong>Attention</strong></div>
      <div className="signal-chart" aria-hidden="true">
        {bars.map((height, index) => <i key={`${height}-${index}`} style={{ height: `${height}%` }} />)}
        <div className="signal-arrival"><span>You</span><b /></div>
      </div>
      <div className="signal-footer"><strong>Early</strong><span>before the crowd</span></div>
    </motion.div>
  );
}

function ReclaimPhone() {
  return (
    <div className="step-phone" aria-hidden="true">
      <div className="phone-speaker" />
      <div className="reclaim-app-icon">R</div>
      <strong>Reclaim Verifier</strong>
      <span>Verify on your device</span>
      <div className="phone-action">Open app</div>
    </div>
  );
}

function ProviderMiniature() {
  return (
    <div className="mini-provider-list" aria-hidden="true">
      {providers.slice(0, 3).map((provider) => (
        <div key={provider.name}>
          <PlatformIcon name={provider.name} icon={provider.icon} />
          <strong>{provider.name}</strong>
          <span>{provider.name === "X" ? "Verify" : "Soon"}</span>
        </div>
      ))}
    </div>
  );
}

function ValuePreview() {
  return (
    <div className="value-preview" aria-hidden="true">
      <div><span>Proof saved</span><strong>Verified</strong></div>
      <div><span>Discovery profile</span><strong>Growing</strong></div>
      <div><span>Creator access</span><strong>Eligible</strong></div>
    </div>
  );
}

function HowStepVisual({ visual }: { visual: (typeof howSteps)[number]["visual"] }) {
  if (visual === "reclaim") return <ReclaimPhone />;
  if (visual === "providers") return <ProviderMiniature />;
  return <ValuePreview />;
}

function HowStepCard({
  step,
  mobile = false,
  reduceMotion = false
}: {
  step: (typeof howSteps)[number];
  mobile?: boolean;
  reduceMotion?: boolean;
}) {
  const motionProps = mobile
    ? {
        initial: reduceMotion ? false : { opacity: 0, y: 52 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, amount: 0.28 },
        transition: { duration: 0.65, ease: [0.16, 1, 0.3, 1] as const }
      }
    : {
        initial: reduceMotion ? false : { opacity: 0, x: 110 },
        animate: { opacity: 1, x: 0 },
        exit: reduceMotion ? { opacity: 0 } : { opacity: 0, x: -70 },
        transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] as const }
      };

  return (
    <motion.article className="how-stage-card" {...motionProps}>
      <div className="how-stage-copy">
        <span>Step {step.number}</span>
        <h3>{step.title}</h3>
        <p>{step.description}</p>
      </div>
      <div className="how-stage-visual">
        <HowStepVisual visual={step.visual} />
      </div>
    </motion.article>
  );
}

function HowEarlyWorks() {
  const sectionRef = useRef<HTMLElement>(null);
  const [activeStep, setActiveStep] = useState(0);
  const reduceMotion = Boolean(useReducedMotion());
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"]
  });

  useMotionValueEvent(scrollYProgress, "change", (progress) => {
    const nextStep = progress < 0.34 ? 0 : progress < 0.68 ? 1 : 2;
    setActiveStep((current) => (current === nextStep ? current : nextStep));
  });

  return (
    <section ref={sectionRef} id="how-it-works" className="how-scroll-story">
      <div className="how-story-sticky">
        <div className="early-container how-story-grid">
          <div className="how-story-intro">
            <span>How Early works</span>
            <h2>From a moment online to proof you can keep.</h2>
            <div className="how-step-index" aria-label={`Step ${activeStep + 1} of ${howSteps.length}`}>
              {howSteps.map((step, index) => (
                <div className={clsx(index === activeStep && "is-active")} key={step.number}>
                  <span>{step.number}</span>
                  <strong>{step.title}</strong>
                  {index === activeStep && <motion.i layoutId="how-step-marker" />}
                </div>
              ))}
            </div>
          </div>

          <div className="how-story-stage" aria-live="polite">
            <AnimatePresence mode="wait">
              <HowStepCard key={howSteps[activeStep].number} step={howSteps[activeStep]} reduceMotion={reduceMotion} />
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="early-container how-story-mobile">
        <header>
          <span>How Early works</span>
          <h2>From a moment online to proof you can keep.</h2>
        </header>
        {howSteps.map((step) => <HowStepCard key={step.number} step={step} mobile reduceMotion={reduceMotion} />)}
      </div>
    </section>
  );
}

function ProviderFocus({ provider, onVerify }: { provider: ProviderName; onVerify: () => void }) {
  const item = providers.find((entry) => entry.name === provider) ?? providers[0];

  return (
    <AnimatePresence mode="wait">
      <motion.div
        className={clsx("provider-focus", provider === "Instagram" && "instagram-focus")}
        key={provider}
        initial={{ opacity: 0.72, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.28 }}
      >
        <div className="provider-focus-copy">
          <PlatformIcon name={item.name} icon={item.icon} />
          <div>
            <span>{provider === "X" ? "Live provider" : "Coming soon"}</span>
            <h3>{provider === "X" ? "Prove you were there early on X." : provider === "Instagram" ? "Turn day-one support into proof." : `Bring your ${provider} history to Early.`}</h3>
            {provider === "X" && <p>Like it. Reply to it. Verify it.</p>}
          </div>
        </div>

        {provider === "X" && <button className="provider-verify" type="button" onClick={onVerify}>Verify with X</button>}

        {provider === "Instagram" && (
          <div className="instagram-proof-stack" aria-label="Examples of creators promising recognition to early fans">
            <img src="/creator-day-one-backstage.jpg" alt="Creator offering future backstage passes to day-one fans" />
            <img src="/creator-small-artist.jpg" alt="Creator asking fans to remember finding them before they grew" />
            <img src="/creator-art-before-famous.jpg" alt="Artist sharing work before becoming widely known" />
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

export function LandingPage({ tweetUrl, setTweetUrl, onSubmit, proofError }: LandingPageProps) {
  const [lineIndex, setLineIndex] = useState(0);
  const [selectedProvider, setSelectedProvider] = useState<ProviderName>("X");
  const [showVerify, setShowVerify] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const interval = window.setInterval(() => setLineIndex((current) => (current + 1) % rotatingLines.length), 2800);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!showVerify) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowVerify(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [showVerify]);

  return (
    <div className="distilled-landing">
      <section id="top" className="vision-hero">
        <div className="early-container vision-grid">
          <div className="vision-copy">
            <h1>Being early used to be a story.</h1>
            <div className="rotating-line" aria-live="polite">
              <AnimatePresence mode="wait">
                <motion.span
                  key={rotatingLines[lineIndex]}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -14 }}
                  transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
                >
                  {rotatingLines[lineIndex]}
                </motion.span>
              </AnimatePresence>
            </div>
            <p>Verify what you found first. Turn it into reputation, access, and rewards.</p>
            <a className="vision-cta" href="#providers">Explore providers</a>
          </div>
          <HeroSignal />
        </div>
      </section>

      <section className="provider-marquee" aria-label="Early provider network">
        <p>Proof of discovery across the internet</p>
        <div className="marquee-window">
          <div className="marquee-track">
            {[...providers, ...providers].map((provider, index) => (
              <div key={`${provider.name}-${index}`} aria-hidden={index >= providers.length}>
                <PlatformIcon name={provider.name} icon={provider.icon} />
                <span>{provider.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <HowEarlyWorks />

      <section id="providers" className="distilled-section providers-section">
        <div className="early-container">
          <header className="distilled-heading centered-distilled-heading">
            <h2>Choose a provider</h2>
            <p>X is live. More of the internet is next.</p>
          </header>

          <motion.div
            className="provider-picker"
            role="tablist"
            aria-label="Proof providers"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.45 }}
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: 0.075 } }
            }}
          >
            {providers.map((provider) => (
              <motion.button
                key={provider.name}
                type="button"
                role="tab"
                aria-selected={selectedProvider === provider.name}
                className={clsx(selectedProvider === provider.name && "is-selected")}
                onClick={() => setSelectedProvider(provider.name)}
                variants={{
                  hidden: { opacity: 0, y: 24 },
                  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } }
                }}
                whileTap={{ scale: 0.98 }}
              >
                <PlatformIcon name={provider.name} icon={provider.icon} />
                <strong>{provider.name}</strong>
                <span>{provider.status}</span>
                {selectedProvider === provider.name && <motion.i className="provider-active-marker" layoutId="provider-active-marker" />}
              </motion.button>
            ))}
          </motion.div>

          <ProviderFocus provider={selectedProvider} onVerify={() => setShowVerify(true)} />
        </div>
      </section>

      <section id="enterprise" className="enterprise-story">
        <div className="early-container">
          <motion.header
            className="enterprise-intro"
            initial={{ opacity: 0, y: 42 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            <span>For creators and brands</span>
            <h2>Turn early belief into a relationship.</h2>
            <p>Early turns verified discovery into a high-signal community you can recognize, reward, and grow with.</p>
          </motion.header>

          <div className="enterprise-audiences">
            <motion.article
              initial={{ opacity: 0, x: -42 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.35 }}
              transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
            >
              <span>Creators</span>
              <h3>Know your day ones.</h3>
              <p>Recognize the people who supported your work before the crowd, then offer access, tickets, drops, or a place in the story.</p>
              <ul><li>Early-fan recognition</li><li>Access and rewards</li><li>Portable community history</li></ul>
            </motion.article>
            <motion.article
              initial={{ opacity: 0, x: 42 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.35 }}
              transition={{ duration: 0.65, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            >
              <span>Brands</span>
              <h3>Reward real attention.</h3>
              <p>Build campaigns around verified early adopters instead of screenshots, self-reported loyalty, or follower counts.</p>
              <ul><li>Private eligibility</li><li>Proof-backed campaigns</li><li>High-signal loyalty</li></ul>
            </motion.article>
          </div>

          <div className="enterprise-capabilities">
            <header><span>What Early makes possible</span></header>
            <div>
              <article><strong>Verified timing</strong><p>Know that an interaction happened, and when.</p></article>
              <article><strong>Private qualification</strong><p>Check eligibility without exposing a person&apos;s full history.</p></article>
              <article><strong>Portable reputation</strong><p>Let proof travel beyond the platform where it began.</p></article>
            </div>
            <a href="mailto:hello@early.xyz">Talk to Early</a>
          </div>

          <motion.article
            id="developers"
            className="developer-row"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.5 }}
          >
            <span>Developers</span>
            <h2>One proof layer. Every platform.</h2>
            <a href="#providers">Explore providers</a>
          </motion.article>
        </div>
      </section>

      <section id="about" className="privacy-story">
        <div className="early-container privacy-story-grid">
          <header>
            <span>Private by design</span>
            <h2>Your login stays with the platform.</h2>
            <p>Reclaim returns only the fact you approved. Early never receives your password, cookies, or full activity history.</p>
          </header>

          <motion.div
            className="privacy-proof-flow"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.45 }}
            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.14 } } }}
          >
            {[
              ["01", "You approve a fact"],
              ["02", "Reclaim verifies it"],
              ["03", "Early receives proof"],
              ["04", "Zama computes privately"]
            ].map(([number, label], index) => (
              <motion.div key={number} variants={{ hidden: { opacity: 0, x: 34 }, visible: { opacity: 1, x: 0, transition: { duration: 0.5 } } }}>
                <span>{number}</span><strong>{label}</strong>
                {index < 3 && <i aria-hidden="true" />}
              </motion.div>
            ))}
          </motion.div>

          <div className="privacy-technology">
            <div><img src="https://www.reclaimprotocol.org/reclaim-logo.png" alt="Reclaim Protocol" /><span>zkTLS verification</span></div>
            <div><strong>ZAMA</strong><span>Encrypted computation</span></div>
          </div>
        </div>
      </section>

      <section id="faq" className="distilled-section distilled-faq">
        <div className="early-container distilled-faq-grid">
          <header><h2>Frequently asked questions</h2></header>
          <div className="distilled-faq-list">
            {faqs.map((faq, index) => {
              const open = openFaq === index;
              return (
                <div className={clsx("distilled-faq-item", open && "is-open")} key={faq.question}>
                  <button type="button" onClick={() => setOpenFaq(open ? -1 : index)} aria-expanded={open}>
                    <span>{faq.question}</span><span aria-hidden="true">{open ? "-" : "+"}</span>
                  </button>
                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.div
                        initial={{ gridTemplateRows: "0fr", opacity: 0 }}
                        animate={{ gridTemplateRows: "1fr", opacity: 1 }}
                        exit={{ gridTemplateRows: "0fr", opacity: 0 }}
                        transition={{ duration: 0.25 }}
                      >
                        <p>{faq.answer}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <footer className="distilled-footer">
        <div className="early-container">
          <div><span className="wordmark-symbol"><i /><i /></span><strong>Early</strong><p>Proof of discovery for the internet.</p></div>
          <nav aria-label="Footer navigation"><a href="#providers">Providers</a><a href="#enterprise">Enterprise</a><a href="#developers">Developers</a><a href="#faq">FAQ</a></nav>
          <small>2026 Early</small>
        </div>
      </footer>

      <AnimatePresence>
        {showVerify && (
          <motion.div className="verify-modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={() => setShowVerify(false)}>
            <motion.div
              className="verify-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="verify-modal-title"
              initial={{ opacity: 0, y: 24, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.985 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <button className="verify-modal-close" type="button" aria-label="Close verification" onClick={() => setShowVerify(false)}>&times;</button>
              <div className="verify-modal-icon"><PlatformIcon name="X" icon={providers[0].icon} /></div>
              <h2 id="verify-modal-title">Verify with X</h2>
              <p>Paste the original post you liked and replied to.</p>
              <form onSubmit={onSubmit} noValidate>
                <label htmlFor="provider-x-url">X post URL</label>
                <input
                  id="provider-x-url"
                  type="url"
                  value={tweetUrl}
                  onChange={(event) => setTweetUrl(event.target.value)}
                  placeholder="https://x.com/creator/status/..."
                  autoComplete="url"
                  inputMode="url"
                  aria-invalid={Boolean(proofError)}
                  autoFocus
                />
                {proofError && <span className="verify-modal-error" role="alert">{proofError}</span>}
                <button type="submit" disabled={!tweetUrl.trim()}>Continue to Reclaim</button>
              </form>
              <small>Early never asks for your X password.</small>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
