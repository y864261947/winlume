"use client";

import { Plus, X } from "lucide-react";
import { useWorkspaceTabs } from "@/lib/studio/workspace-tabs";

export default function WorkspaceTabBar() {
  const { tabs, activeTabId, activateTab, closeTab, openHomeTab } = useWorkspaceTabs();

  if (tabs.length === 0) return null;

  return (
    <div className="studio-workspace-tabbar flex shrink-0 items-center gap-1 overflow-x-auto border-b border-white/50 px-2 py-1.5">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            className={`group flex h-8 min-w-0 max-w-[200px] shrink-0 items-center gap-1.5 rounded-[9px] pl-3 pr-1.5 text-[13px] transition ${
              isActive
                ? "bg-white/85 text-[#241E36] shadow-sm"
                : "text-[#8A8298] hover:bg-white/50 hover:text-[#615A73]"
            }`}
          >
            <button
              type="button"
              onClick={() => activateTab(tab.id)}
              className="min-w-0 flex-1 truncate text-left"
              title={tab.title}
            >
              {tab.title}
            </button>
            {tabs.length > 1 ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  closeTab(tab.id);
                }}
                aria-label="关闭标签"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] text-[#AAA2B2] opacity-0 transition hover:bg-black/5 hover:text-[#615A73] group-hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>
        );
      })}
      <button
        type="button"
        onClick={openHomeTab}
        title="开始创作"
        aria-label="新建标签"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] text-[#8A8298] transition hover:bg-white/60 hover:text-[#241E36]"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
