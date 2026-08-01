import Link from "next/link";
import { ArrowUpRight, BookOpen, ExternalLink } from "lucide-react";
import { ConsolePage } from "@/components/console/ConsolePage";

const curlExample = "curl https://api.winlume.com/v1/chat/completions -H \"Authorization: Bearer $WINLUME_API_KEY\" -H \"Content-Type: application/json\" -d '{\"model\":\"gpt-4.1-mini\",\"messages\":[...]}'";

export default function AccountApiContent() {
  return (
    <ConsolePage title="API 文档" description="WinLume Gateway 兼容 OpenAI 风格请求格式。使用 API Key 作为 Bearer Token。">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="space-y-5">
          <div className="border border-line bg-surface p-5">
            <div className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-ink-600" /><h2 className="text-sm font-semibold text-ink-950">兼容端点</h2></div>
            <div className="mt-4 overflow-x-auto border border-line bg-canvas p-3 font-mono text-xs leading-6 text-ink-800"><p>POST /v1/chat/completions</p><p>POST /v1/responses</p><p>POST /v1/images/generations</p><p>GET /v1/models</p></div>
            <p className="mt-4 text-sm leading-6 text-ink-600">请求会通过 WinLume Gateway 做密钥校验、余额预留、模型路由和最终结算。请不要在浏览器或客户端包内嵌入密钥。</p>
          </div>
          <div className="border border-line bg-surface p-5"><h2 className="text-sm font-semibold text-ink-950">认证</h2><pre className="mt-4 overflow-x-auto border border-line bg-canvas p-3 font-mono text-xs leading-6 text-ink-800">{curlExample}</pre></div>
        </section>
        <aside className="border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold text-ink-950">开始接入</h2>
          <ol className="mt-4 space-y-3 text-sm leading-6 text-ink-600"><li>1. 创建一个专用 API Key。</li><li>2. 写入部署环境变量。</li><li>3. 通过 <code className="font-mono text-xs">/v1/models</code> 验证连接。</li></ol>
          <Link href="/account/keys" className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-ink-700 hover:text-ink-950">管理 API Keys <ArrowUpRight className="h-4 w-4" /></Link>
          <a className="mt-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-950" href="https://platform.openai.com/docs/api-reference" target="_blank" rel="noreferrer">请求格式参考 <ExternalLink className="h-3.5 w-3.5" /></a>
        </aside>
      </div>
    </ConsolePage>
  );
}
