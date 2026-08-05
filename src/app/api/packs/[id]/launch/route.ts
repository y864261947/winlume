import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserId } from "@/lib/auth/session";
import {
  getProductionPack,
  toProductionPackMeta,
} from "@/lib/agent/production-packs/registry";
import { resolveProductionPackAvailability } from "@/lib/agent/production-packs/availability";
import {
  createWorkflowSessionBinding,
  parseWorkflowSessionBinding,
  WorkflowSessionBindingError,
  type WorkflowSessionBinding,
} from "@/lib/agent/production-packs/session-binding";
import type { ProductionPack } from "@/lib/agent/production-packs/contracts";
import type { CapabilityCatalog } from "@/lib/studio/capabilities";
import { loadCapabilityCatalog } from "@/lib/studio/capabilities.server";
import { webStore } from "@/lib/host/web/store-singleton";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IdContext = { params: Promise<{ id: string }> };

const launchBodySchema = z
  .object({
    version: z.string().regex(/^\d+\.\d+\.\d+$/).max(32),
    intake: z.record(z.string(), z.unknown()),
    projectId: z.string().trim().min(1).max(160).optional(),
    sessionId: z.string().trim().min(1).max(160).optional(),
  })
  .strict();

function comparableBinding(
  binding: WorkflowSessionBinding,
  includePackSnapshot = true,
): string {
  const intakeValues = Object.fromEntries(
    Object.entries(binding.intakeValues)
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([id, value]) => [
        id,
        Array.isArray(value) ? [...value].sort((a, b) => a.localeCompare(b, "en")) : value,
      ]),
  );
  return JSON.stringify({
    schemaVersion: binding.schemaVersion,
    workflowId: binding.workflowId,
    packId: binding.packId,
    packVersion: binding.packVersion,
    ...(includePackSnapshot && binding.packSnapshot
      ? { packSnapshot: binding.packSnapshot }
      : {}),
    intakeValues,
    inputArtifactIds: [...binding.inputArtifactIds].sort((a, b) =>
      a.localeCompare(b, "en"),
    ),
  });
}

async function validateInputArtifacts(
  userId: string,
  pack: ProductionPack,
  binding: WorkflowSessionBinding,
): Promise<Response | null> {
  for (const field of pack.intake) {
    if (field.type !== "artifact") continue;
    const artifactId = binding.intakeValues[field.id];
    if (artifactId === undefined) continue;
    if (typeof artifactId !== "string") {
      return NextResponse.json(
        { error: `Invalid Artifact intake: ${field.id}` },
        { status: 400 },
      );
    }
    const artifact = await webStore.artifacts.get(userId, artifactId);
    if (!artifact) {
      return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
    }
    if (!field.kinds.includes(artifact.kind)) {
      return NextResponse.json(
        { error: `Artifact kind is not allowed for ${field.id}` },
        { status: 400 },
      );
    }
  }
  return null;
}

function selectedModel(catalog: CapabilityCatalog): string {
  const chat = catalog.capabilities.find(
    (entry) => entry.id === "chat" && entry.availability === "available",
  );
  return chat?.effectiveModel ?? catalog.models[0] ?? "gpt-4o-mini";
}

function launchPayload(
  pack: ProductionPack,
  availability: ReturnType<typeof resolveProductionPackAvailability>,
  session: Awaited<ReturnType<typeof webStore.sessions.createSession>>,
) {
  const firstStage = pack.stages[0];
  return {
    pack: { ...toProductionPackMeta(pack), availability },
    session,
    initialStage: {
      id: firstStage.id,
      title: firstStage.title,
      index: 0,
      status: "ready" as const,
    },
  };
}

export async function POST(request: NextRequest, context: IdContext) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const body = launchBodySchema.safeParse(rawBody);
  if (!body.success) {
    return NextResponse.json({ error: "Invalid launch request" }, { status: 400 });
  }

  const { id } = await context.params;
  const pack = await getProductionPack(id);
  if (!pack) {
    return NextResponse.json({ error: "Pack not found" }, { status: 404 });
  }
  if (body.data.version !== pack.version) {
    return NextResponse.json(
      { error: "Pack version is unavailable", code: "pack_version_unavailable" },
      { status: 409 },
    );
  }

  const capabilityCatalog = await loadCapabilityCatalog();
  const availability = resolveProductionPackAvailability(pack, capabilityCatalog);

  const projectId = body.data.projectId;
  if (projectId) {
    const project = await webStore.projects.getProject(userId, projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
  }

  const existingSession = body.data.sessionId
    ? await webStore.sessions.getSession(userId, body.data.sessionId)
    : null;
  if (body.data.sessionId && !existingSession) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (existingSession && projectId && existingSession.projectId !== projectId) {
    return NextResponse.json(
      { error: "Session is outside the requested project" },
      { status: 409 },
    );
  }

  let existingBinding: WorkflowSessionBinding | undefined;
  if (existingSession) {
    if (!existingSession.workflow) {
      return NextResponse.json(
        { error: "Session is not a Workflow Session" },
        { status: 409 },
      );
    }
    try {
      existingBinding = parseWorkflowSessionBinding(existingSession.workflow);
    } catch {
      return NextResponse.json(
        { error: "Stored workflow binding is invalid" },
        { status: 409 },
      );
    }
  }

  let binding: WorkflowSessionBinding;
  try {
    binding = createWorkflowSessionBinding(pack, body.data.intake, {
      workflowId: existingBinding?.workflowId ?? randomUUID(),
      ...(existingBinding
        ? { now: new Date(existingBinding.boundAt) }
        : {}),
    });
  } catch (error) {
    const message =
      error instanceof WorkflowSessionBindingError
        ? error.message
        : "Invalid workflow intake";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (existingSession && existingBinding) {
    const includePackSnapshot = Boolean(existingBinding.packSnapshot);
    if (
      comparableBinding(existingBinding, includePackSnapshot) !==
      comparableBinding(binding, includePackSnapshot)
    ) {
      return NextResponse.json(
        { error: "Session already has a different Workflow binding" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      launchPayload(pack, availability, existingSession),
      { status: 200 },
    );
  }

  if (!availability.available) {
    return NextResponse.json(
      {
        error: "Pack requirements are unavailable",
        code: "pack_unavailable",
        availability,
      },
      { status: 409 },
    );
  }

  const artifactError = await validateInputArtifacts(userId, pack, binding);
  if (artifactError) return artifactError;

  const session = await webStore.sessions.createSession({
    id: randomUUID(),
    userId,
    title: pack.title,
    model: selectedModel(capabilityCatalog),
    ...(projectId ? { projectId } : {}),
    workflow: binding,
  });
  return NextResponse.json(launchPayload(pack, availability, session), {
    status: 201,
  });
}
