"use client";

import { useEffect } from "react";
import { loginGreeting } from "@/lib/login-welcome";
import { lockBodyScroll, unlockBodyScroll } from "@/lib/scrollLock";
import "./login-welcome.css";

/** The supplied design's glass → greeting → dissolve sequence, after real login. */
export default function LoginWelcome({ name, onFinished }: { name: string; onFinished: () => void }) {
  useEffect(() => {
    let layer: HTMLDialogElement | null = null;
    let leaving = false;
    let finished = false;
    let locked = false;
    let frame = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timing = reduced ? { glass: 150, text: 150, hold: 2000, exit: 200 } : { glass: 720, text: 900, hold: 2000, exit: 900 };
    const later = (callback: () => void, delay: number) => {
      const timer = setTimeout(() => { timers.delete(timer); callback(); }, delay);
      timers.add(timer);
    };
    const clearTimers = () => {
      timers.forEach(clearTimeout);
      timers.clear();
      cancelAnimationFrame(frame);
    };
    const remove = () => {
      clearTimers();
      layer?.close();
      layer?.remove();
      layer = null;
      if (locked) { unlockBodyScroll(); locked = false; }
    };
    const finish = () => {
      if (finished) return;
      finished = true;
      remove();
      onFinished();
    };
    const dismiss = () => {
      if (!layer || leaving) return;
      leaving = true;
      clearTimers();
      layer.classList.add("is-leaving");
      later(finish, timing.exit);
    };
    const show = () => {
      if (finished || layer || document.visibilityState === "hidden") return;
      const text = loginGreeting(name);
      layer = document.createElement("dialog");
      layer.className = "account-welcome";
      layer.setAttribute("aria-label", text);
      const greeting = document.createElement("p");
      greeting.setAttribute("role", "status");
      greeting.textContent = text;
      layer.append(greeting);
      document.body.append(layer);
      lockBodyScroll();
      locked = true;
      layer.showModal();
      layer.addEventListener("click", dismiss);
      layer.addEventListener("cancel", event => { event.preventDefault(); dismiss(); });
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          layer?.classList.add("is-visible");
          later(() => {
            layer?.classList.add("is-readable");
            later(dismiss, timing.text + timing.hold);
          }, timing.glass);
        });
      });
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") { if (layer) finish(); }
      else show();
    };
    // Let the login modal's 150ms exit and focus cleanup finish first.
    later(show, 200);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", finish);
    return () => {
      finished = true;
      remove();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", finish);
    };
  }, [name, onFinished]);

  return null;
}
