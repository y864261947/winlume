"use client";

import { Fragment, useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

// Values verified in x.ai/bot's published HeroIntroProvider and title-reveal
// modules (1qu9uc2ui3eg0.js, module IDs 23268 / 649105 / 8404).
// This sequence intentionally includes text blur: the requested reference uses
// that blur together with opposite-direction text and product entrances.
export const referenceIntro = {
  ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
  wordDuration: 0.65,
  wordStart: 0.1,
  wordStagger: 0.055,
  copyStart: 500,
  actionStart: 650,
  productStart: 800,
  copyDuration: 1.1,
  actionDuration: 1,
  productDuration: 1,
};

const hiddenWord = { opacity: 0, rotateX: -40, y: "45%" };
const shownWord = { opacity: 1, rotateX: 0, y: 0 };
const hiddenCopy = { opacity: 0, filter: "blur(12px)", y: -10 };
const shownCopy = { opacity: 1, filter: "blur(0px)", y: 0 };
const hiddenProduct = { opacity: 0, y: -20 };
const shownProduct = { opacity: 1, y: 0 };

export function useLandingIntro() {
  const reduced = useReducedMotion() === true;
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (reduced) {
      const frame = requestAnimationFrame(() => setPhase(4));
      return () => cancelAnimationFrame(frame);
    }
    const copy = setTimeout(() => setPhase(value => Math.max(value, 1)), referenceIntro.copyStart);
    const actions = setTimeout(() => setPhase(value => Math.max(value, 2)), referenceIntro.actionStart);
    const product = setTimeout(() => setPhase(value => Math.max(value, 3)), referenceIntro.productStart);
    // The real desktop renderer is substantially heavier than the reference's
    // marketing demo. Hydrate it after the entrance, under its exact screenshot.
    const interactive = setTimeout(() => setPhase(value => Math.max(value, 4)), referenceIntro.productStart + referenceIntro.productDuration * 1000);
    return () => { clearTimeout(copy); clearTimeout(actions); clearTimeout(product); clearTimeout(interactive); };
  }, [reduced]);
  return { reduced, phase };
}

export function LandingTitle({ reduced }: { reduced: boolean }) {
  return <h1 id="landing-title" style={{ perspective: reduced ? undefined : 1200 }}>
    {["REIZO"].map((word, index) => <Fragment key={word}>{index > 0 ? " " : null}<motion.span
      data-intro-word={index}
      style={{ display: "inline-block", position: "relative" }}
      initial={reduced ? false : hiddenWord}
      animate={shownWord}
      transition={reduced ? { duration: 0 } : { duration: referenceIntro.wordDuration, delay: referenceIntro.wordStart + index * referenceIntro.wordStagger, ease: referenceIntro.ease }}
    >{word}</motion.span></Fragment>)}
  </h1>;
}

export function LandingDescription({ reduced, phase, children }: ReturnType<typeof useLandingIntro> & { children: React.ReactNode }) {
  return <motion.p data-intro-layer="copy" initial={reduced ? false : hiddenCopy}
    animate={reduced || phase >= 1 ? shownCopy : hiddenCopy}
    transition={{ duration: reduced ? 0 : referenceIntro.copyDuration, ease: referenceIntro.ease }}
  >{children}</motion.p>;
}

export function LandingActions({ reduced, phase, children }: ReturnType<typeof useLandingIntro> & { children: React.ReactNode }) {
  return <motion.div className="landing-actions" data-intro-layer="actions" initial={reduced ? false : hiddenCopy}
    animate={reduced || phase >= 2 ? shownCopy : hiddenCopy}
    transition={{ duration: reduced ? 0 : referenceIntro.actionDuration, ease: referenceIntro.ease }}
  >{children}</motion.div>;
}

export function LandingProduct({ reduced, phase, children }: ReturnType<typeof useLandingIntro> & { children: React.ReactNode }) {
  return <motion.div className="landing-product-entry" data-intro-layer="product" initial={reduced ? false : hiddenProduct}
    animate={reduced || phase >= 3 ? shownProduct : hiddenProduct}
    transition={{ duration: reduced ? 0 : referenceIntro.productDuration, ease: referenceIntro.ease }}
  >{children}</motion.div>;
}
