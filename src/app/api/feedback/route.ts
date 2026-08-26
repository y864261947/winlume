import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import { getPlatformRepositories } from "@/lib/platform/repositories";

const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_SCREENSHOTS = 5;
const MAX_SCREENSHOT_BYTES = 700_000;

type SubmitFeedbackBody = {
  type?: string;
  description?: string;
  screenshots?: string[];
};

function screenshotBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Math.floor((base64.length * 3) / 4);
}

export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  let body: SubmitFeedbackBody;
  try {
    body = (await request.json()) as SubmitFeedbackBody;
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const type = body.type === "bug" || body.type === "feature" ? body.type : null;
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const screenshots = Array.isArray(body.screenshots) ? body.screenshots : [];

  if (!type) {
    return NextResponse.json({ error: "请选择反馈类型" }, { status: 400 });
  }
  if (!description) {
    return NextResponse.json({ error: "请填写详细描述" }, { status: 400 });
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return NextResponse.json({ error: `描述不能超过 ${MAX_DESCRIPTION_LENGTH} 字` }, { status: 400 });
  }
  if (screenshots.length > MAX_SCREENSHOTS) {
    return NextResponse.json({ error: `最多上传 ${MAX_SCREENSHOTS} 张截图` }, { status: 400 });
  }
  for (const screenshot of screenshots) {
    if (typeof screenshot !== "string" || !screenshot.startsWith("data:image/")) {
      return NextResponse.json({ error: "截图格式无效" }, { status: 400 });
    }
    if (screenshotBytes(screenshot) > MAX_SCREENSHOT_BYTES) {
      return NextResponse.json({ error: "截图文件过大，请压缩后重试" }, { status: 400 });
    }
  }

  const repositories = getPlatformRepositories();
  if (!repositories) {
    return NextResponse.json({ error: "平台数据库尚未配置。" }, { status: 503 });
  }

  try {
    const report = await repositories.feedback.create({
      userId,
      type,
      description,
      screenshots,
    });
    return NextResponse.json({ report });
  } catch (error) {
    console.error("[api/feedback] POST", error);
    return NextResponse.json({ error: "提交反馈失败，请稍后重试" }, { status: 500 });
  }
}

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const repositories = getPlatformRepositories();
  if (!repositories) {
    return NextResponse.json({ reports: [] });
  }

  try {
    const reports = await repositories.feedback.listByUser(userId);
    return NextResponse.json({ reports });
  } catch (error) {
    console.error("[api/feedback] GET", error);
    return NextResponse.json({ error: "加载反馈失败，请稍后重试" }, { status: 500 });
  }
}
