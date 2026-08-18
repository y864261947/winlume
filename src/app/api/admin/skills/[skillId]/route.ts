import { NextRequest, NextResponse } from "next/server";
import { clearSkillsCache } from "@/lib/agent/skills/registry";
import { PlatformAdminError, requirePlatformAdmin } from "@/lib/platform/admin";
import { getPlatformRepositories } from "@/lib/platform/repositories";
import { recordToSkill, recordToSkillMeta } from "@/lib/platform/repositories/skills";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ skillId: string }> };

function adminError(error: unknown) {
  if (error instanceof PlatformAdminError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("[admin/skills/:id]", error);
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Skill 更新失败" },
    { status: 500 },
  );
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    await requirePlatformAdmin();
    const { skillId } = await context.params;
    const repositories = getPlatformRepositories();
    if (!repositories) {
      return NextResponse.json({ error: "平台数据库尚未配置。" }, { status: 503 });
    }
    const row = await repositories.skills.findById(skillId);
    if (!row) return NextResponse.json({ error: "Skill 不存在" }, { status: 404 });
    const full = request.nextUrl.searchParams.get("full") === "1";
    return NextResponse.json({
      skill: full ? recordToSkill(row) : recordToSkillMeta(row),
    });
  } catch (error) {
    return adminError(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    await requirePlatformAdmin();
    const { skillId } = await context.params;
    const repositories = getPlatformRepositories();
    if (!repositories) {
      return NextResponse.json({ error: "平台数据库尚未配置。" }, { status: 503 });
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const patch: Parameters<typeof repositories.skills.update>[1] = {};
    if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
    if (typeof body.description === "string") patch.description = body.description;
    if (typeof body.category === "string" && body.category.trim()) {
      patch.category = body.category.trim();
    }
    if (Array.isArray(body.triggers)) {
      patch.triggers = body.triggers.map((item) => String(item).trim()).filter(Boolean);
    }
    if (typeof body.examplePrompt === "string" || body.examplePrompt === null) {
      patch.examplePrompt = body.examplePrompt;
    }
    if (typeof body.systemPrompt === "string") patch.systemPrompt = body.systemPrompt;
    if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
    if (typeof body.featured === "boolean") patch.featured = body.featured;
    const row = await repositories.skills.update(skillId, patch);
    if (!row) return NextResponse.json({ error: "Skill 不存在" }, { status: 404 });
    clearSkillsCache();
    return NextResponse.json({ skill: recordToSkillMeta(row) });
  } catch (error) {
    return adminError(error);
  }
}
