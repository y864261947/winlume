import type { createDesignScope } from "./design-scope";

const projects = {
  design: "春夏训练系列 · 品牌视觉", video: "日常鞋履 · 发布短片",
  marketing: "生活方式品牌 · 7 天内容计划", website: "葡萄酒酒庄 · 品牌独立站",
  legal: "供应商合同 · 风险与付款安排", product: "染烫后护理 · 新品概念",
  office: "本周工作 · 会议行动看板", research: "数字化能力与创新绩效 · 研究框架",
} as const;
type Project = keyof typeof projects;
const isProject = (value: unknown): value is Project => typeof value === "string" && Object.hasOwn(projects, value);

/** Mount the real desktop renderer once. Switching tabs preserves canvas edits. */
export default function initialize(scope: ReturnType<typeof createDesignScope>) {
  const panel = scope.document.querySelector<HTMLElement>("#scene-panel");
  const tabs = [...scope.document.querySelectorAll<HTMLButtonElement>("[data-scene]")];
  if (!panel || !tabs.length) return;
  let active: Project = "design";
  let ready = false;
  let loadingTimer = 0;
  const frame = document.createElement("iframe");
  frame.className = "project-experience-frame";
  frame.title = `REIZO 工作台 · ${projects[active]}`;
  frame.loading = "lazy";
  frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-downloads");
  frame.src = "/reizo/experience/index.html?project=design";
  const loading = document.createElement("div");
  loading.className = "project-experience-loading";
  loading.setAttribute("role", "status");
  const label = document.createElement("span");
  label.textContent = "正在打开 REIZO 工作台…";
  const retry = document.createElement("button");
  retry.type = "button";
  retry.textContent = "重新加载";
  retry.hidden = true;
  loading.append(label, retry);
  panel.replaceChildren(frame, loading);
  panel.setAttribute("aria-busy", "true");
  const request = () => frame.contentWindow?.postMessage({ type: "reizo-experience-open-project", project: active }, window.location.origin);
  const select = (project: Project, notify = true) => {
    active = project;
    tabs.forEach(tab => {
      const selected = tab.dataset.scene === project;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    panel.setAttribute("aria-labelledby", `tab-${project}`);
    frame.title = `REIZO 工作台 · ${projects[project]}`;
    if (notify && ready) request();
  };
  scope.listen(window, "message", ((event: MessageEvent) => {
    if (event.origin !== window.location.origin || event.source !== frame.contentWindow) return;
    if (event.data?.type === "reizo-experience-ready") {
      ready = true;
      scope.clearTimeout(loadingTimer);
      loading.hidden = true;
      panel.setAttribute("aria-busy", "false");
      request();
    } else if (event.data?.type === "reizo-experience-project" && isProject(event.data.project)) {
      select(event.data.project, false);
    }
  }) as EventListener);
  const watchLoading = () => {
    scope.clearTimeout(loadingTimer);
    loadingTimer = scope.setTimeout(() => {
      if (!ready) { label.textContent = "工作台加载未完成，请重试。"; retry.hidden = false; }
    }, 20000);
  };
  watchLoading();
  scope.listen(frame, "load", () => {
    frame.contentWindow?.postMessage({ type: "reizo-experience-host-ready" }, window.location.origin);
  });
  scope.listen(retry, "click", () => {
    ready = false;
    loading.hidden = false;
    panel.setAttribute("aria-busy", "true");
    retry.hidden = true;
    label.textContent = "正在打开 REIZO 工作台…";
    frame.src = `/reizo/experience/index.html?project=${active}&retry=${Date.now()}`;
    watchLoading();
  });
  tabs.forEach(tab => scope.listen(tab, "click", () => { if (isProject(tab.dataset.scene)) select(tab.dataset.scene); }));
  scope.listen(scope.document.querySelector(".scene-tabs"), "keydown", ((event: KeyboardEvent) => {
    const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0 || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].focus({ preventScroll: true });
    tabs[next].click();
    tabs[next].scrollIntoView({ block: "nearest", inline: "nearest" });
  }) as EventListener);
}
