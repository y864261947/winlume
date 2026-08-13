// 引用计数式背景滚动锁定：多个弹层（Modal、移动端抽屉）并存时，
// 只有最后一个关闭才会恢复 body 滚动，避免互相踩踏。
let lockCount = 0;

export function lockBodyScroll() {
  if (typeof document === "undefined") return;
  lockCount += 1;
  if (lockCount === 1) document.body.style.overflow = "hidden";
}

export function unlockBodyScroll() {
  if (typeof document === "undefined") return;
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.style.overflow = "";
    document.body.style.removeProperty("pointer-events");
  }
}
