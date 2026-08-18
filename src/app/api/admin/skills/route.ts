import { NextRequest, NextResponse } from "next/server";
import { importOpenCatalogs } from "@/lib/agent/skills/import-catalogs";
import { importMasterSkills } from "@/lib/agent/skills/import-master";
import { clearSkillsCache, seedBundledSkills } from "@/lib/agent/skills/registry";
import { translateImportedSkillLabels } from "@/lib/agent/skills/translate-zh";
import { PlatformAdminError, requirePlatformAdmin } from "@/lib/platform/admin";
import { getPlatformRepositories } from "@/lib/platform/repositories";
import { recordToSkillMeta } from "@/lib/platform/repositories/skills";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function adminError(error: unknown) {
  if (error instanceof PlatformAdminError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("[admin/skills]", error);
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Skill 管理失败" },
    { status: 500 },
  );
}

export async function GET(request: NextRequest) {
  try {
    await requirePlatformAdmin();
    const repositories = getPlatformRepositories();
    if (!repositories) {
      return NextResponse.json({ error: "平台数据库尚未配置。" }, { status: 503 });
    }
    const { searchParams } = new URL(request.url);
    const enabledParam = searchParams.get("enabled");
    const featuredParam = searchParams.get("featured");
    const source = searchParams.get("source");
    const limit = Number.parseInt(searchParams.get("limit") ?? "40", 10);
    const offset = Number.parseInt(searchParams.get("offset") ?? "0", 10);
    const page = await repositories.skills.listPage(
      {
        q: searchParams.get("q") ?? undefined,
        category: searchParams.get("category") ?? undefined,
        source:
          source === "bundled" || source === "imported" || source === "user"
            ? source
            : undefined,
        enabled: enabledParam === "true" ? true : enabledParam === "false" ? false : undefined,
        featured: featuredParam === "true" ? true : featuredParam === "false" ? false : undefined,
      },
      { limit, offset },
    );
    return NextResponse.json({
      skills: page.rows.map((row, index) => ({
        ...recordToSkillMeta(row),
        promptChars: page.promptChars[index] ?? 0,
      })),
      total: page.total,
      limit: Math.min(Math.max(limit || 40, 1), 80),
      offset: Math.max(offset || 0, 0),
      hasMore: Math.max(offset || 0, 0) + page.rows.length < page.total,
    });
  } catch (error) {
    return adminError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requirePlatformAdmin();
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      limit?: number;
    };
    if (body.action === "sync-bundled") {
      const written = await seedBundledSkills();
      clearSkillsCache();
      return NextResponse.json({ ok: true, action: body.action, written });
    }
    if (body.action === "import-master") {
      const result = await importMasterSkills();
      return NextResponse.json({ ok: true, action: body.action, written: result.imported });
    }
    if (body.action === "import-open-catalogs") {
      const result = await importOpenCatalogs();
      return NextResponse.json({
        ok: true,
        action: body.action,
        written: result.imported,
        catalogs: result.catalogs,
      });
    }
    if (body.action === "translate-zh") {
      const result = await translateImportedSkillLabels({
        limit: typeof body.limit === "number" ? body.limit : 40,
      });
      return NextResponse.json({ ok: true, action: body.action, ...result });
    }
    return NextResponse.json({ error: "未知操作" }, { status: 400 });
  } catch (error) {
    return adminError(error);
  }
}
