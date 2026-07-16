"use client";

/* eslint-disable @next/next/no-img-element */

import { FormEvent, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

type LandingPageProps = {
  tweetUrl: string;
  setTweetUrl: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  proofError: string;
};

const faqItems = [
  {
    question: "What kind of X post works?",
    answer:
      "Use the original public X post where your account both liked and replied. Early verifies those interactions from your authenticated X session."
  },
  {
    question: "Am I claiming I predicted something would go viral?",
    answer:
      "No. Early proves when you were present, not what you predicted. A proof can matter because the moment later became culturally important, because a creator wants to recognize early supporters, or simply because being early is part of your internet history."
  },
  {
    question: "What does Reclaim prove?",
    answer:
      "Reclaim uses zkTLS to verify authenticated facts from X without asking you to trust a screenshot or manually entered timestamp. Early turns that verified result into a portable proof."
  },
  {
    question: "Why does Early use Zama?",
    answer:
      "One public interaction is not the private part. Your complete discovery history is. Zama lets Early compute useful signals, such as campaign eligibility or an early-supporter tier, without publishing every interaction and timestamp."
  },
  {
    question: "Is Early only for X?",
    answer:
      "No. X is the first working proof of concept. Early is being designed for discovery across YouTube, GitHub, Instagram, Spotify, and the other places where culture starts before the crowd arrives."
  },
  {
    question: "What can creators, brands, and developers do with it?",
    answer:
      "Creators can recognize early supporters, brands can build campaigns around verified discovery, and developers can use normalized proof providers and private eligibility checks inside their own products."
  }
] as const;

const attentionSteps = [
  { label: "The first 12", value: "12", dots: 12 },
  { label: "The first 100", value: "100", dots: 20 },
  { label: "The first 1K", value: "1K", dots: 28 },
  { label: "The first 10K", value: "10K", dots: 36 },
  { label: "The first 100K+", value: "100K+", dots: 46 }
] as const;

const platforms = [
  { name: "X", status: "Live", tone: "green", icon: "https://cdn.simpleicons.org/x/75FF82" },
  { name: "YouTube", status: "Next", tone: "coral", icon: "https://cdn.simpleicons.org/youtube/FF5C55" },
  { name: "GitHub", status: "Planned", tone: "cyan", icon: "https://cdn.simpleicons.org/github/52D7DD" },
  { name: "Spotify", status: "Planned", tone: "sun", icon: "https://cdn.simpleicons.org/spotify/F4C84A" },
  { name: "Instagram", status: "Planned", tone: "cobalt", icon: "https://cdn.simpleicons.org/instagram/7790FF" }
] as const;

function SignalMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={clsx("signal-mark", compact && "signal-mark-compact")} aria-hidden="true">
      {Array.from({ length: 12 }, (_, index) => (
        <i key={index} style={{ transform: `rotate(${index * 30}deg)` }} />
      ))}
    </span>
  );
}

function FloraSprig({ position }: { position: "top" | "bottom" }) {
  return (
    <div className={clsx("flora", `flora-${position}`)} aria-hidden="true">
      <img src="https://images.unsplash.com/photo-1593762365249-6f124edefa4e?auto=format&fit=crop&w=900&q=88" alt="" />
    </div>
  );
}

function AttentionField({ dots }: { dots: number }) {
  return (
    <span className="attention-field" aria-hidden="true">
      <span className="attention-core" />
      {Array.from({ length: dots }, (_, index) => {
        const angle = (index / dots) * Math.PI * 2;
        const ring = 30 + (index % 5) * 7;
        const x = (50 + Math.cos(angle) * ring).toFixed(3);
        const y = (50 + Math.sin(angle) * ring).toFixed(3);
        return <i key={index} style={{ left: `${x}%`, top: `${y}%` }} />;
      })}
    </span>
  );
}

function HeroArchive() {
  return (
    <div className="archive-stage" aria-label="A post, reply, timestamp, and Early receipt connected as proof">
      <article className="artifact artifact-post archive-float-one">
        <div className="artifact-person">
          <span className="artifact-avatar artifact-avatar-coral">N</span>
          <span><strong>Nia posted</strong><small>@niacreates</small></span>
          <span className="artifact-more">...</span>
        </div>
        <p>New sound. No rollout. Just putting it here.</p>
        <time>8:21 AM</time>
        <div className="artifact-actions"><span>12 replies</span><span>12 likes</span></div>
      </article>

      <article className="artifact artifact-video archive-float-two">
        <div className="video-still"><span className="play-mark">▶</span></div>
        <div className="video-progress"><span /></div>
        <small>0:23 / 1:07</small>
      </article>

      <article className="artifact artifact-reply archive-float-three">
        <div className="artifact-person">
          <span className="artifact-avatar artifact-avatar-blue">Y</span>
          <span><strong>You</strong><small>Replying to @niacreates</small></span>
        </div>
        <p>This has been on repeat all morning.</p>
        <div className="reply-proof"><span>liked</span><span>replied</span></div>
      </article>

      <div className="artifact artifact-comment archive-float-four">
        <span className="comment-dot" />
        <strong>rare catch</strong>
        <span>keep this one</span>
      </div>

      <div className="artifact artifact-timestamp archive-float-five">MAY 16, 2026 · 08:37:12 UTC</div>

      <div className="artifact artifact-music archive-float-six">
        <span className="music-play">▶</span><strong>01:23</strong><span className="music-track"><i /></span><strong>03:45</strong>
      </div>

      <div className="signal-path signal-path-a" aria-hidden="true" />
      <div className="signal-path signal-path-b" aria-hidden="true" />
      <span className="signal-node signal-node-source" aria-hidden="true" />
      <span className="signal-node signal-node-receipt" aria-hidden="true" />

      <article className="proof-ticket archive-float-seven">
        <div className="ticket-brand"><SignalMark compact /><strong>EARLY RECEIPT</strong></div>
        <div><small>Proof recorded</small><strong>Hash 7A9F...3C2D</strong></div>
        <div className="ticket-status"><small>VERIFIED</small><strong>Discovery #0042</strong></div>
      </article>
    </div>
  );
}

export function LandingPage({ tweetUrl, setTweetUrl, onSubmit, proofError }: LandingPageProps) {
  const landingRef = useRef<HTMLDivElement>(null);
  const [openFaq, setOpenFaq] = useState(0);

  useEffect(() => {
    if (!landingRef.current) return;

    gsap.registerPlugin(ScrollTrigger);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) return;

    const context = gsap.context(() => {
      gsap.fromTo(
        ".landing-intro",
        { opacity: 0, y: 28 },
        { opacity: 1, y: 0, duration: 0.85, stagger: 0.11, ease: "power3.out" }
      );
      gsap.fromTo(
        ".archive-stage",
        { opacity: 0, x: 36, scale: 0.97 },
        { opacity: 1, x: 0, scale: 1, duration: 1, delay: 0.32, ease: "power3.out" }
      );
      gsap.fromTo(
        ".attention-step",
        { opacity: 0.22, y: 28, scale: 0.9 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          stagger: 0.12,
          ease: "power2.out",
          scrollTrigger: { trigger: ".attention-journey", start: "top 72%", end: "bottom 65%", scrub: 0.5 }
        }
      );
      gsap.fromTo(
        ".attention-progress",
        { scaleX: 0 },
        {
          scaleX: 1,
          ease: "none",
          scrollTrigger: { trigger: ".attention-journey", start: "top 78%", end: "bottom 58%", scrub: 0.5 }
        }
      );
      gsap.utils.toArray<HTMLElement>(".scroll-reveal").forEach((element) => {
        gsap.fromTo(
          element,
          { opacity: 0, y: 42 },
          { opacity: 1, y: 0, duration: 0.8, ease: "power3.out", scrollTrigger: { trigger: element, start: "top 84%", once: true } }
        );
      });
      gsap.to(".flora-top", { rotation: 1.5, duration: 4.6, yoyo: true, repeat: -1, ease: "sine.inOut", transformOrigin: "center bottom" });
      gsap.to(".flora-bottom", { rotation: -1.5, duration: 5.2, yoyo: true, repeat: -1, ease: "sine.inOut", transformOrigin: "center bottom" });
    }, landingRef);

    return () => context.revert();
  }, []);

  return (
    <div ref={landingRef} className="landing-world">
      <FloraSprig position="top" />

      <section id="prove" className="landing-hero">
        <div className="landing-shell hero-grid">
          <div className="hero-copy">
            <div className="landing-intro live-label"><span className="live-dot" />Live on X</div>
            <h1 className="landing-intro">Being early used to be a story. <span>Now it&apos;s proof.</span></h1>
            <p className="landing-intro hero-description">
              Early turns what you discovered before the crowd into verifiable proof. Start with an X post you liked and replied to.
            </p>

            <form onSubmit={onSubmit} className="landing-intro proof-entry" noValidate>
              <label htmlFor="x-post-url">Paste the original X post URL</label>
              <div className={clsx("proof-entry-row", proofError && "proof-entry-error") }>
                <input
                  id="x-post-url"
                  type="url"
                  inputMode="url"
                  autoComplete="url"
                  value={tweetUrl}
                  onChange={(event) => setTweetUrl(event.target.value)}
                  placeholder="https://x.com/creator/status/..."
                  aria-describedby={proofError ? "proof-entry-error" : "proof-entry-help"}
                  aria-invalid={Boolean(proofError)}
                />
                <button type="submit" disabled={!tweetUrl.trim()}>
                  Create proof <span aria-hidden="true">→</span>
                </button>
              </div>
              <p id="proof-entry-help">Your account must have both liked and replied to the post.</p>
              {proofError && <p id="proof-entry-error" role="alert" className="form-error">{proofError}</p>}
            </form>
          </div>

          <HeroArchive />
        </div>

        <a href="#story" className="scroll-cue"><SignalMark compact /> Scroll to witness <span aria-hidden="true">↓</span></a>
      </section>

      <section id="story" className="attention-section">
        <div className="landing-shell">
          <div className="section-intro scroll-reveal">
            <p className="section-kicker">Proof of discovery</p>
            <h2>Before it became obvious.</h2>
            <p>Every cultural moment starts small. Early preserves your authenticated place near the beginning, then lets the world catch up.</p>
          </div>

          <div className="attention-journey" aria-label="An early post growing from 12 interactions to more than 100,000">
            {attentionSteps.map((step, index) => (
              <div className="attention-step" key={step.value}>
                <small>{index === 0 ? "The moment" : `+${index === 1 ? "1 day" : index === 2 ? "3 days" : index === 3 ? "1 week" : "2 weeks"}`}</small>
                <AttentionField dots={step.dots} />
                <strong>{step.value}</strong>
                <span>{step.label}</span>
              </div>
            ))}
            <div className="attention-rule"><span className="attention-progress" /></div>
            <div className="attention-caption"><span>Authenticated memory</span><span>Portable proof</span></div>
          </div>
        </div>
      </section>

      <section className="proof-story-section">
        <div className="landing-shell proof-story-grid">
          <div className="proof-story-copy scroll-reveal">
            <p className="section-kicker">Memory becomes proof</p>
            <h2>A screenshot is a claim. Early makes it proof.</h2>
            <p>Early verifies the interaction through your authenticated platform session, then normalizes it into a receipt that can travel beyond the original feed.</p>
          </div>
          <div className="proof-story-flow scroll-reveal">
            <div className="flow-source"><span className="artifact-avatar artifact-avatar-coral">X</span><strong>Liked + replied</strong><small>Authenticated activity</small></div>
            <span className="flow-arrow" aria-hidden="true">→</span>
            <div className="flow-source flow-reclaim"><strong>Reclaim</strong><small>zkTLS proof</small></div>
            <span className="flow-arrow" aria-hidden="true">→</span>
            <div className="mini-ticket"><SignalMark compact /><strong>Early receipt</strong><small>Portable proof</small></div>
          </div>
        </div>
      </section>

      <section className="private-section">
        <div className="landing-shell private-grid">
          <div className="private-vault scroll-reveal" aria-label="Private discovery history producing a campaign eligibility result">
            <div className="vault-orbit orbit-one">X · 08:37</div>
            <div className="vault-orbit orbit-two">YT · #7</div>
            <div className="vault-orbit orbit-three">GH · first star</div>
            <div className="vault-core"><SignalMark /><small>ENCRYPTED HISTORY</small><strong>Private by default</strong></div>
            <div className="vault-result"><span>Campaign check</span><strong>Eligible</strong></div>
          </div>
          <div className="private-copy scroll-reveal">
            <p className="section-kicker">One proof becomes reputation</p>
            <h2>Your discovery history should be useful, not exposed.</h2>
            <p>A public reply may already exist. The sensitive thing is the full pattern: everywhere you showed up early, every timestamp, and what that says about you.</p>
            <p>Zama lets Early compute private eligibility and reputation signals while revealing only the result a campaign or product needs.</p>
            <div className="technology-line"><span>Private computation with</span><img className="technology-logo technology-logo-zama" src="https://cdn.prod.website-files.com/61bc21e3a843412266a08eb3/68417dce00c33fce2253fc6e_Untitled%20design%20(1).svg" alt="Zama" /></div>
          </div>
        </div>
      </section>

      <section id="for-creators" className="audiences-section">
        <div className="landing-shell">
          <div className="section-intro audience-heading scroll-reveal">
            <p className="section-kicker">What proof unlocks</p>
            <h2>Cool on its own. Powerful when someone recognizes it.</h2>
          </div>

          <article className="audience-scene audience-fans scroll-reveal">
            <div><span className="audience-index">For tastemakers</span><h3>Turn internet instinct into cultural reputation.</h3><p>Keep proof of the artists, ideas, videos, and communities you found before broader attention arrived.</p></div>
            <div className="receipt-stack" aria-hidden="true"><span>first reply</span><span>early listener</span><span>before the crowd</span></div>
          </article>

          <article className="audience-scene audience-creators scroll-reveal">
            <div className="supporter-ring" aria-hidden="true"><span>12</span><i /><i /><i /><i /><i /></div>
            <div><span className="audience-index">For creators</span><h3>Know who showed up before the numbers did.</h3><p>Recognize early supporters with access, loyalty, rewards, or a place in the story without relying on screenshots and memory.</p></div>
          </article>

          <article id="for-brands" className="audience-scene audience-brands scroll-reveal">
            <div><span className="audience-index">For brands</span><h3>Reward discovery without buying another attention metric.</h3><p>Build campaigns around verified early activity and privately check eligibility without collecting a person&apos;s complete history.</p></div>
            <div className="campaign-pass" aria-label="Example private campaign result"><small>EARLY CAMPAIGN</small><span>Found before 10K</span><strong>ELIGIBLE</strong></div>
          </article>
        </div>
      </section>

      <section className="platform-section">
        <div className="landing-shell">
          <div className="section-intro platform-heading scroll-reveal">
            <p className="section-kicker">X is the first proof, not the whole idea</p>
            <h2>Discovery happens everywhere.</h2>
          </div>
          <div className="platform-line scroll-reveal">
            {platforms.map((platform) => (
              <div key={platform.name} className={clsx("platform-item", `platform-${platform.tone}`)}>
                <span className="platform-symbol"><img src={platform.icon} alt="" /></span>
                <strong>{platform.name}</strong>
                <small>{platform.status}</small>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="developers" className="developer-section">
        <div className="landing-shell developer-grid">
          <div className="developer-copy scroll-reveal">
            <p className="section-kicker">Infrastructure for builders</p>
            <h2>Build with the proof layer, not every platform&apos;s plumbing.</h2>
            <p>Early&apos;s provider layer is designed to normalize authenticated discovery claims across platforms, verify them once, and expose privacy-preserving eligibility to other products.</p>
            <div className="developer-capabilities">
              <span>Provider registry</span><span>Normalized claims</span><span>Verification API</span><span>Private eligibility</span><span>Campaign webhooks</span>
            </div>
          </div>
          <div className="code-artifact scroll-reveal" aria-label="Conceptual Early developer interface">
            <div className="code-title"><SignalMark compact /><span>Developer preview</span></div>
            <pre><code><span className="code-muted">// Verify discovery without rebuilding the provider</span>{"\n"}<span className="code-coral">const</span> proof = <span className="code-coral">await</span> early.verify({"{"}{"\n"}  provider: <span className="code-sun">&quot;x&quot;</span>,{"\n"}  claim: <span className="code-sun">&quot;liked_and_replied&quot;</span>,{"\n"}  url{"\n"}{"}"});{"\n\n"}<span className="code-muted">// Reveal the result, not the full history</span>{"\n"}<span className="code-coral">const</span> eligible = <span className="code-coral">await</span> early.checkEligibility(proof);</code></pre>
          </div>
        </div>
      </section>

      <section className="protocol-section">
        <div className="landing-shell protocol-grid">
          <div className="scroll-reveal"><p className="section-kicker">The trust stack</p><h2>Proof from the platform. Privacy for the person.</h2></div>
          <div className="protocol-parts scroll-reveal">
            <div><span className="protocol-brand"><img className="protocol-logo protocol-logo-reclaim" src="https://www.reclaimprotocol.org/reclaim-logo.png" alt="Reclaim Protocol" /><strong className="reclaim-wordmark">Reclaim</strong></span><p>Uses zkTLS to verify authenticated platform activity without trusting a screenshot.</p></div>
            <span className="protocol-join" aria-hidden="true">+</span>
            <div><span className="protocol-brand"><img className="protocol-logo protocol-logo-zama" src="https://cdn.prod.website-files.com/61bc21e3a843412266a08eb3/68417dce00c33fce2253fc6e_Untitled%20design%20(1).svg" alt="Zama" /></span><p>Uses FHE to compute useful reputation and eligibility while the underlying history stays encrypted.</p></div>
          </div>
        </div>
      </section>

      <section className="faq-section">
        <FloraSprig position="bottom" />
        <div className="landing-shell faq-grid">
          <div className="faq-heading scroll-reveal"><p className="section-kicker">Before you paste</p><h2>The useful questions.</h2><p>Everything you need to understand the first proof and the larger protocol.</p></div>
          <div className="faq-list">
            {faqItems.map((item, index) => {
              const isOpen = openFaq === index;
              return (
                <motion.div key={item.question} layout className={clsx("faq-item", isOpen && "faq-item-open")}>
                  <button type="button" onClick={() => setOpenFaq(isOpen ? -1 : index)} aria-expanded={isOpen} aria-controls={`faq-answer-${index}`}>
                    <span>{item.question}</span><span className="faq-toggle" aria-hidden="true">{isOpen ? "−" : "+"}</span>
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div id={`faq-answer-${index}`} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28 }}>
                        <p>{item.answer}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-shell"><div className="footer-brand"><SignalMark /><strong>Early</strong></div><p>&copy; 2026 Early. Proof of discovery for the internet.</p><a href="#prove">Create your first proof <span aria-hidden="true">↑</span></a></div>
      </footer>
    </div>
  );
}
