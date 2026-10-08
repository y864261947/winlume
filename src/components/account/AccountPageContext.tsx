"use client";

import { createContext } from "react";

export const accountPages: Record<string, { group: string; title: string; description: string }> = {
  "/account": { group: "我的账户", title: "账户概览", description: "" },
  "/account/personalization": { group: "我的账户", title: "资料与设置", description: "管理身份资料、账户安全和使用偏好。" },
  "/account/security": { group: "我的账户", title: "账户安全", description: "保护你的登录凭证，管理账户安全。" },
  "/account/wallet": { group: "钱包与会员", title: "钱包与账单", description: "查看账户余额、充值记录与实际用量。工作台和 API 共用账户余额。" },
  "/account/pricing": { group: "钱包与会员", title: "我的会员", description: "查看已经开通的方案与有效期；购买前的比较留在会员与价格页。" },
  "/account/invite": { group: "钱包与会员", title: "邀请好友", description: "分享 REIZO，让好用的 AI 被更多人发现。" },
  "/account/enterprise": { group: "钱包与会员", title: "对公结算", description: "集中了解企业结算、合同与开票服务。" },
  "/account/tasks": { group: "开发与协作", title: "任务看板", description: "任务记录、用量与额度，一眼掌握。" },
  "/account/keys": { group: "开发与协作", title: "API 密钥", description: "一个项目，一份独立凭证。密钥只应保存在服务端，避免公开分享。" },
  "/account/logs": { group: "开发与协作", title: "调用日志", description: "查看请求状态、模型用量与扣费记录，定位每一次调用。" },
  "/account/team": { group: "开发与协作", title: "团队管理", description: "让成员、职责与开发权限保持清晰。" },
  "/account/usage": { group: "钱包与会员", title: "用量明细", description: "按工作区核对模型使用与额度扣减。" },
  "/account/community": { group: "帮助与支持", title: "交流社区", description: "找到交流渠道，获得使用帮助。" },
};

export const AccountPageContext = createContext<(typeof accountPages)[string] | null>(null);
