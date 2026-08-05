"use client";

import { useEffect, useRef, useState } from "react";

/** Common CJK script ranges: Hiragana/Katakana, CJK ideographs, fullwidth forms, Hangul. */
const CJK_PATTERN =
  /[぀-ヿ㐀-䶿一-鿿豈-﫿＀-￯가-힣]/;

function isCjk(char: string): boolean {
  return CJK_PATTERN.test(char);
}

/**
 * Picks the next chunk of `remaining` text to reveal in one animation tick.
 *
 * CJK scripts have no spaces between words, so revealing them a whole "word"
 * at a time would just dump large runs at once; they reveal one character
 * per tick instead, which reads as a natural, even typewriter cadence.
 * Latin/word scripts reveal a whole word (plus trailing whitespace) per
 * tick — single-letter reveal at the same tick rate looks noticeably
 * slower and choppier for Latin text than for CJK, so word-at-a-time keeps
 * the perceived pace comparable across languages. Whitespace/newline runs
 * are always revealed immediately so paragraph breaks never look like a
 * pause in typing.
 */
export function nextRevealChunk(remaining: string): string {
  if (remaining.length === 0) return "";
  const first = remaining[0];

  if (/\s/.test(first)) {
    let end = 1;
    while (end < remaining.length && /\s/.test(remaining[end])) end++;
    return remaining.slice(0, end);
  }

  if (isCjk(first)) {
    return first;
  }

  let end = 1;
  while (end < remaining.length && !/\s/.test(remaining[end]) && !isCjk(remaining[end])) {
    end++;
  }
  while (end < remaining.length && /\s/.test(remaining[end])) end++;
  return remaining.slice(0, end);
}

/** ~31 ticks/sec: smooth to the eye, comfortable reading speed for either script. */
const REVEAL_TICK_MS = 32;

/**
 * Paces the visual reveal of streaming assistant text at a steady rate
 * instead of jumping straight to whatever the network/model just delivered.
 * Chunk arrival from the model is bursty (network jitter, batching, uneven
 * token timing); this decouples the typewriter cadence from that so it
 * stays smooth regardless.
 *
 * Only smooths *new* text arriving while `streaming` is true. It never
 * replays a backlog from scratch: a freshly mounted message (e.g. resuming
 * a turn after navigating back) or a finished message shows in full
 * immediately, and animation only applies to deltas from that point on.
 */
export function useSmoothStreamText(fullText: string, streaming: boolean): string {
  const [displayed, setDisplayed] = useState(fullText);
  const [prevStreaming, setPrevStreaming] = useState(streaming);
  const displayedRef = useRef(fullText);
  const targetRef = useRef(fullText);

  // Keep both refs effect-synced (never mutate a ref during render) so the
  // interval always reads the latest values without needing to depend on
  // them and restart on every single delta.
  useEffect(() => {
    targetRef.current = fullText;
  }, [fullText]);
  useEffect(() => {
    displayedRef.current = displayed;
  }, [displayed]);

  // React's documented pattern for resetting state on a prop transition:
  // adjust state directly during render instead of via an effect. The
  // moment streaming stops, show the real content immediately — no queued
  // animation tail after the message is actually done.
  if (streaming !== prevStreaming) {
    setPrevStreaming(streaming);
    if (!streaming) setDisplayed(fullText);
  }

  useEffect(() => {
    if (!streaming) return;

    const timer = setInterval(() => {
      const target = targetRef.current;
      const current = displayedRef.current;
      if (target.length < current.length) {
        // Content was reset out from under us (edit/replace); snap to it.
        displayedRef.current = target;
        setDisplayed(target);
        return;
      }
      if (current.length >= target.length) return;
      const next = current + nextRevealChunk(target.slice(current.length));
      displayedRef.current = next;
      setDisplayed(next);
    }, REVEAL_TICK_MS);

    return () => clearInterval(timer);
  }, [streaming]);

  return displayed;
}
