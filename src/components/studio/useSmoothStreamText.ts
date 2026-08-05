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

/** Reveal exactly one scheduled chunk, or snap when the target was replaced. */
export function nextDisplayedText(displayed: string, target: string): string {
  if (target.length < displayed.length) return target;
  if (displayed.length >= target.length) return displayed;
  return displayed + nextRevealChunk(target.slice(displayed.length));
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
 * immediately. When a stream closes with unrevealed text, that tail is
 * drained on the same cadence instead of being flushed in one render.
 */
export function useSmoothStreamText(fullText: string, streaming: boolean): string {
  const [displayed, setDisplayed] = useState(fullText);
  const displayedRef = useRef(fullText);
  const targetRef = useRef(fullText);
  const streamingRef = useRef(streaming);

  // Keep both refs effect-synced (never mutate a ref during render) so the
  // interval always reads the latest values without needing to depend on
  // them and restart on every single delta.
  useEffect(() => {
    targetRef.current = fullText;
  }, [fullText]);
  useEffect(() => {
    displayedRef.current = displayed;
  }, [displayed]);

  // A finished message restored from storage should render in full. A stream
  // that just closed is different: its remaining text must stay queued so the
  // final render does not turn into a burst.
  useEffect(() => {
    const wasStreaming = streamingRef.current;
    streamingRef.current = streaming;
    if (!streaming && !wasStreaming) {
      displayedRef.current = fullText;
      setDisplayed(fullText);
    }
  }, [fullText, streaming]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const tick = () => {
      const target = targetRef.current;
      const current = displayedRef.current;
      if (current.length >= target.length) {
        if (!streamingRef.current && timer) {
          clearInterval(timer);
          timer = null;
        }
        return;
      }
      const next = nextDisplayedText(current, target);
      displayedRef.current = next;
      setDisplayed(next);
    };

    if (streaming || displayedRef.current.length < targetRef.current.length) {
      timer = setInterval(tick, REVEAL_TICK_MS);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [streaming]);

  return displayed;
}
