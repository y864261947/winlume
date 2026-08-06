import { ConsoleEmptyState, ConsolePage } from "@/components/console/ConsolePage";

export type AccountPricingStatus =
  | "unauthenticated"
  | "unconfigured"
  | "no_active_catalog"
  | "ready";

export type AccountPricingModelRow = {
  modelKey: string;
  mode: string;
  modelRatio: string | null;
  fixedPriceUsd: string | null;
  completionRatio: string | null;
  cacheReadRatio: string | null;
  cacheWriteRatio: string | null;
  cacheWriteOneHourRatio: string | null;
  imageRatio: string | null;
  audioInputRatio: string | null;
  audioCompletionRatio: string | null;
};

export type AccountPricingProps = {
  status: AccountPricingStatus;
  billingGroup?: string;
  userGroup?: string;
  /**
   * "api_key" means the billing group was resolved from the caller's own
   * api_key_billing_policies rows; "default" means no unambiguous per-user
   * billing group could be resolved and the page fell back to the
   * catalog's "default" group instead of guessing.
   */
  billingGroupSource?: "api_key" | "default";
  catalog?: {
    algorithmVersion: string;
    activatedAt: string | null;
    quotaPerUnit: string;
  };
  groupRatio?: string;
  models?: AccountPricingModelRow[];
};

const modeLabels: Record<string, string> = {
  ratio: "按量比例",
  fixed: "固定单价",
  tiered_expr: "阶梯表达式",
};

function ratio(value: string | null | undefined): string {
  if (value === null || value === undefined) return "--";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "--";
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 6 }).format(parsed);
}

function date(value: string | null | undefined): string {
  if (!value) return "--";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "--"
    : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

export default function AccountPricingContent({
  status,
  billingGroup,
  userGroup,
  billingGroupSource,
  catalog,
  groupRatio,
  models,
}: AccountPricingProps) {
  const description = "查看当前生效的计费目录如何为你的请求定价，账户信息只读，不能在此修改。";

  if (status === "unauthenticated") {
    return (
      <ConsolePage title="我的计费" description={description}>
        <ConsoleEmptyState title="请先登录" description="登录后即可查看你的实际计费费率。" />
      </ConsolePage>
    );
  }

  if (status === "unconfigured") {
    return (
      <ConsolePage title="我的计费" description={description}>
        <ConsoleEmptyState title="计费数据暂不可用" description="平台数据库尚未配置，请稍后重试。" />
      </ConsolePage>
    );
  }

  if (status === "no_active_catalog") {
    return (
      <ConsolePage title="我的计费" description={description}>
        <ConsoleEmptyState title="暂无生效的计费目录" description="网关尚未激活任何计费目录版本，费率暂时无法展示。" />
      </ConsolePage>
    );
  }

  const isDefaultFallback = billingGroupSource === "default";

  return (
    <ConsolePage title="我的计费" description={description}>
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="border border-line bg-surface p-5">
            <p className="text-sm text-ink-500">计费组</p>
            <p className="mt-3 font-mono text-2xl font-semibold text-ink-950">{billingGroup}</p>
            <p className="mt-1 text-xs text-ink-500">用户组 {userGroup}</p>
          </div>
          <div className="border border-line bg-surface p-5">
            <p className="text-sm text-ink-500">组倍率</p>
            <p className="mt-3 font-mono text-2xl font-semibold text-ink-950">{ratio(groupRatio)}</p>
            <p className="mt-1 text-xs text-ink-500">叠加在模型倍率之上</p>
          </div>
          <div className="border border-line bg-surface p-5">
            <p className="text-sm text-ink-500">算法版本</p>
            <p className="mt-3 font-mono text-2xl font-semibold text-ink-950">{catalog?.algorithmVersion ?? "--"}</p>
            <p className="mt-1 text-xs text-ink-500">生效于 {date(catalog?.activatedAt)}</p>
          </div>
          <div className="border border-line bg-surface p-5">
            <p className="text-sm text-ink-500">额度换算</p>
            <p className="mt-3 font-mono text-2xl font-semibold text-ink-950">{ratio(catalog?.quotaPerUnit)}</p>
            <p className="mt-1 text-xs text-ink-500">每计价单位对应的额度</p>
          </div>
        </div>

        {isDefaultFallback ? (
          <div className="border border-dashed border-line-strong bg-canvas px-5 py-4 text-sm leading-6 text-ink-600">
            未能从你名下的 API Key 计费策略中解析出唯一的计费组，以下展示的是目录的
            <span className="mx-1 font-mono text-ink-800">default</span>
            计费组费率，仅供参考，不代表你的账户一定按此计费。
          </div>
        ) : (
          <div className="border border-dashed border-line-strong bg-canvas px-5 py-4 text-sm leading-6 text-ink-600">
            以下费率基于你名下 API Key 的计费策略解析得出。
          </div>
        )}

        <section className="border border-line bg-surface">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-sm font-semibold text-ink-950">模型费率</h2>
            <p className="mt-1 text-xs text-ink-500">
              仅展示对你的计费组开放的模型：enabled_groups 为空（对所有组开放）或包含
              <span className="mx-1 font-mono text-ink-700">{billingGroup}</span>
              的定价规则。
            </p>
          </div>
          {!models || models.length === 0 ? (
            <ConsoleEmptyState title="暂无可用模型定价" description="当前计费组下没有匹配的模型定价规则。" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="border-b border-line bg-canvas text-xs text-ink-500">
                  <tr>
                    <th className="px-4 py-3">模型</th>
                    <th className="px-4 py-3">计价方式</th>
                    <th className="px-4 py-3 text-right">模型倍率 / 固定单价</th>
                    <th className="px-4 py-3 text-right">输出倍率</th>
                    <th className="px-4 py-3 text-right">缓存读取</th>
                    <th className="px-4 py-3 text-right">缓存写入</th>
                    <th className="px-4 py-3 text-right">缓存写入(1h)</th>
                    <th className="px-4 py-3 text-right">图像</th>
                    <th className="px-4 py-3 text-right">音频输入</th>
                    <th className="px-4 py-3 text-right">音频输出</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {models.map((model) => (
                    <tr key={model.modelKey}>
                      <td className="px-4 py-3 font-mono text-xs text-ink-800">{model.modelKey}</td>
                      <td className="px-4 py-3 text-ink-700">{modeLabels[model.mode] ?? model.mode}</td>
                      <td className="px-4 py-3 text-right font-mono text-ink-800">
                        {model.mode === "fixed" ? ratio(model.fixedPriceUsd) : ratio(model.modelRatio)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-ink-700">{ratio(model.completionRatio)}</td>
                      <td className="px-4 py-3 text-right font-mono text-ink-700">{ratio(model.cacheReadRatio)}</td>
                      <td className="px-4 py-3 text-right font-mono text-ink-700">{ratio(model.cacheWriteRatio)}</td>
                      <td className="px-4 py-3 text-right font-mono text-ink-700">{ratio(model.cacheWriteOneHourRatio)}</td>
                      <td className="px-4 py-3 text-right font-mono text-ink-700">{ratio(model.imageRatio)}</td>
                      <td className="px-4 py-3 text-right font-mono text-ink-700">{ratio(model.audioInputRatio)}</td>
                      <td className="px-4 py-3 text-right font-mono text-ink-700">{ratio(model.audioCompletionRatio)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </ConsolePage>
  );
}
