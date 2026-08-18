import { NextRequest, NextResponse } from "next/server";
import {
  getSkill,
  listDepartments,
  listSkillsFiltered,
} from "@/lib/agent/skills/registry";
import {
  listProductionPacksForScene,
  toProductionPackMeta,
} from "@/lib/agent/production-packs/registry";
import { getWorkScene, WORK_SCENES } from "@/lib/studio/work-scenes";
import { catalogsFromDepartmentCounts } from "@/lib/studio/tool-categories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/skills
 * Query: q?, category?, catalog?, featured?, limit?, offset?, id? (single skill with optional body)
 *
 * Public browse — no auth required (skills are bundled content).
 * When `id` is set and `full=1`, returns full Skill including systemPrompt.
 * `departments` is always full counts (not filtered by q/category/featured).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const id = searchParams.get("id")?.trim();

  if (id) {
    const skill = await getSkill(id);
    if (!skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }
    const full = searchParams.get("full") === "1" || searchParams.get("full") === "true";
    if (full) {
      return NextResponse.json({ skill });
    }
    const { systemPrompt: _omit, ...meta } = skill;
    return NextResponse.json({ skill: meta });
  }

  const q = searchParams.get("q") ?? undefined;
  const category = searchParams.get("category") ?? undefined;
  const catalog = searchParams.get("catalog") ?? undefined;
  const scene = searchParams.get("scene") ?? undefined;
  const activeScene = getWorkScene(scene);
  const featured =
    searchParams.get("featured") === "1" ||
    searchParams.get("featured") === "true";
  const limitRaw = Number(searchParams.get("limit") ?? "");
  const offsetRaw = Number(searchParams.get("offset") ?? "");
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(100, Math.floor(limitRaw))
      : undefined;
  const offset =
    Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0;
  const matched = await listSkillsFiltered({
    q,
    category,
    catalog,
    featured: featured || undefined,
    scene,
  });
  const total = matched.length;
  const skills = limit ? matched.slice(offset, offset + limit) : matched;
  const categories = [...new Set(matched.map((s) => s.category))].sort((a, b) =>
    a.localeCompare(b, "zh"),
  );

  // Also expose full category list from unfiltered set when filtering
  let allCategories = categories;
  if (q || featured || (category && category !== "all") || catalog || activeScene) {
    const all = await listSkillsFiltered({});
    allCategories = [...new Set(all.map((s) => s.category))].sort((a, b) =>
      a.localeCompare(b, "zh"),
    );
  }

  const departments = await listDepartments();
  const packs = activeScene
    ? await listProductionPacksForScene(activeScene.id)
    : [];

  return NextResponse.json({
    skills,
    categories: allCategories,
    departments,
    catalogs: catalogsFromDepartmentCounts(departments),
    scenes: WORK_SCENES,
    activeScene,
    packs: packs.map(toProductionPackMeta),
    total,
    hasMore: limit ? offset + skills.length < total : false,
  });
}
