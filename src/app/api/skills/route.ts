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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/skills
 * Query: q?, category?, featured?, id? (single skill with optional body)
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
  const scene = searchParams.get("scene") ?? undefined;
  const activeScene = getWorkScene(scene);
  const featured =
    searchParams.get("featured") === "1" ||
    searchParams.get("featured") === "true";
  const skills = await listSkillsFiltered({
    q,
    category,
    featured: featured || undefined,
    scene,
  });
  const categories = [...new Set(skills.map((s) => s.category))].sort((a, b) =>
    a.localeCompare(b, "zh"),
  );

  // Also expose full category list from unfiltered set when filtering
  let allCategories = categories;
  if (q || featured || (category && category !== "all") || activeScene) {
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
    scenes: WORK_SCENES,
    activeScene,
    packs: packs.map(toProductionPackMeta),
    total: skills.length,
  });
}
