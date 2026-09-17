import type { Metadata } from "next";

export const metadata: Metadata = { title: "免责声明 - Reizo" };

export default function DisclaimerPage() {
  return (
    <article className="legal-article">
      <h1>免责声明</h1>
      <p>最后更新：2026 年 9 月</p>
      <p>
        Reizo 聚合多家模型与工具能力。页面中的能力介绍、示例与价格展示可能随上游通道变化；实际可用模型、延迟与扣费以登录后账户内信息为准。
      </p>
      <h2>生成内容</h2>
      <p>
        工作台与应用生成的文本、图像或其他结果不构成专业建议。你应核对其准确性、合法性与适用性后再使用。
      </p>
      <h2>第三方服务</h2>
      <p>
        部分能力由第三方模型或基础设施提供。其可用性、审查策略与数据处理受相应提供方约束，我们无法保证其持续不中断。
      </p>
      <h2>链接与外部站点</h2>
      <p>
        站内可能包含指向外部网站的链接，我们不对其内容或隐私实践负责。
      </p>
    </article>
  );
}
