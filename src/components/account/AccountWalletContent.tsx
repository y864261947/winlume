"use client";

import Link from "next/link";
import { ArrowUpRight, Ticket, TrendingUp, WalletCards } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ConsoleUsageCharts } from "@/components/account/ConsoleUsageCharts";
import { ConsoleEmptyState, ConsolePage } from "@/components/console/ConsolePage";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { StatTile } from "@/components/ui/stat-tile";
import { DEFAULT_QUOTA_PER_UNIT } from "@/lib/catalog/plaza-display";
import {
  getConsoleOrganizations,
  getConsoleOverview,
  getConsoleUsage,
  getConsoleUsageCharts,
  redeemConsoleCode,
} from "@/lib/console/client";
import type {
  ConsoleAccountUsage,
  ConsoleOrganization,
  ConsoleOverview,
  ConsoleUsageCharts as ConsoleUsageChartsData,
} from "@/lib/console/types";

function amount(value: number) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
}

function creditsFromQuota(quota: number) {
  return quota / DEFAULT_QUOTA_PER_UNIT;
}

export default function AccountWalletContent() {
  const [overview, setOverview] = useState<ConsoleOverview | null>(null);
  const [organizations, setOrganizations] = useState<ConsoleOrganization[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [accountUsage, setAccountUsage] = useState<ConsoleAccountUsage | null>(null);
  const [charts, setCharts] = useState<ConsoleUsageChartsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [redeemMessage, setRedeemMessage] = useState<string | null>(null);

  const loadWorkspace = useCallback(async () => {
    setError(null);
    try {
      const [overviewResult, orgsResult] = await Promise.all([
        getConsoleOverview(),
        getConsoleOrganizations(),
      ]);
      setOverview(overviewResult);
      setOrganizations(orgsResult.organizations);
      setOrganizationId((current) => {
        if (current) return current;
        return orgsResult.organizationId ?? overviewResult.activeOrganization?.id ?? orgsResult.organizations[0]?.id ?? null;
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法加载钱包。");
    } finally {
      setWorkspaceReady(true);
    }
  }, []);

  const loadUsage = useCallback(async (targetOrganizationId: string | null) => {
    if (!targetOrganizationId) {
      setAccountUsage(null);
      setCharts(null);
      setUsageError(null);
      return;
    }
    setUsageError(null);
    try {
      const [usageResult, chartsResult] = await Promise.all([
        getConsoleUsage(targetOrganizationId),
        getConsoleUsageCharts(targetOrganizationId),
      ]);
      setAccountUsage(usageResult);
      setCharts(chartsResult);
    } catch (reason) {
      setAccountUsage(null);
      setCharts(null);
      setUsageError(reason instanceof Error ? reason.message : "无法加载用量。");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadWorkspace(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadWorkspace]);

  useEffect(() => {
    if (!workspaceReady) return;
    const timer = window.setTimeout(() => { void loadUsage(organizationId); }, 0);
    return () => window.clearTimeout(timer);
  }, [workspaceReady, organizationId, loadUsage]);

  const activeOrganization = organizationId
    ? organizations.find((organization) => organization.id === organizationId) ?? null
    : overview?.activeOrganization ?? null;
  const canRedeem = activeOrganization?.role === "owner" || activeOrganization?.role === "admin";
  const available = accountUsage
    ? creditsFromQuota(accountUsage.quota)
    : overview?.wallet.availableCredits ?? 0;
  const used = accountUsage
    ? creditsFromQuota(accountUsage.usedQuota)
    : overview?.wallet.usedCredits ?? 0;

  async function redeem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = code.trim();
    if (!normalized) {
      setRedeemError("请输入兑换码。");
      return;
    }
    setRedeeming(true);
    setRedeemError(null);
    setRedeemMessage(null);
    try {
      const result = await redeemConsoleCode({
        organizationId,
        code: normalized,
      });
      setCode("");
      setRedeemMessage(result.credits != null ? `兑换成功，已到账 ${amount(result.credits)} 额度。` : "兑换成功。");
      await Promise.all([loadWorkspace(), loadUsage(organizationId)]);
    } catch (reason) {
      setRedeemError(reason instanceof Error ? reason.message : "兑换失败，请稍后重试。");
    } finally {
      setRedeeming(false);
    }
  }

  return (
    <ConsolePage
      title="钱包与用量"
      description="工作区额度账户的余额、兑换和消耗趋势。"
    >
      {organizations.length > 1 && organizationId ? (
        <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <span>工作区</span>
          <Select value={organizationId} onValueChange={setOrganizationId}>
            <SelectTrigger aria-label="选择工作区" className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {organizations.map((organization) => (
                  <SelectItem key={organization.id} value={organization.id}>{organization.name}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {!overview && !error ? (
        <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Spinner /> 正在加载钱包与用量…
        </div>
      ) : null}
      {error ? <ConsoleEmptyState title="钱包暂不可用" description={error} /> : null}

      {overview ? (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="grid gap-4 sm:grid-cols-2">
              <StatTile
                label="可用额度"
                value={amount(available)}
                hint={overview.wallet.currency}
                icon={WalletCards}
                tone="primary"
              />
              <StatTile
                label="累计已用"
                value={amount(used)}
                hint="以工作区额度账户为准"
                icon={TrendingUp}
              />
            </div>
            <Card className="h-fit">
              <CardHeader>
                <CardTitle>兑换码</CardTitle>
                <CardDescription>充入当前工作区额度账户。</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={redeem} className="flex flex-col gap-3">
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="redeem-code">兑换码</FieldLabel>
                      <Input
                        id="redeem-code"
                        value={code}
                        onChange={(event) => setCode(event.target.value)}
                        placeholder="输入兑换码"
                        autoComplete="off"
                        maxLength={128}
                      />
                      <FieldDescription>
                        {!organizationId
                          ? "选择工作区后才能兑换。"
                          : canRedeem
                            ? `当前工作区：${activeOrganization?.name}`
                            : "只有工作区 owner 或 admin 可以兑换。"}
                      </FieldDescription>
                    </Field>
                  </FieldGroup>
                  {redeemError ? <FieldError>{redeemError}</FieldError> : null}
                  {redeemMessage ? (
                    <Alert>
                      <AlertDescription>{redeemMessage}</AlertDescription>
                    </Alert>
                  ) : null}
                  <Button type="submit" disabled={redeeming || !canRedeem || !organizationId}>
                    {redeeming ? <Spinner data-icon="inline-start" /> : <Ticket data-icon="inline-start" />}
                    兑换
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          {usageError ? (
            <Alert variant="destructive">
              <AlertDescription>{usageError}</AlertDescription>
            </Alert>
          ) : null}

          {!organizationId ? (
            <ConsoleEmptyState title="还没有工作区" description="余额和消耗记在工作区额度账户上。被邀请加入后会出现在这里。" />
          ) : (
            <>
              <ConsoleUsageCharts charts={charts} keys={accountUsage?.items ?? []} />
              <div className="flex justify-end">
                <Link href="/account/logs" className="inline-flex items-center gap-1 text-sm font-medium text-ink-700 hover:text-ink-950">
                  查看请求日志 <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </>
          )}
        </div>
      ) : null}
    </ConsolePage>
  );
}
