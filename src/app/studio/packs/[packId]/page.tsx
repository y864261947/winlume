import { WorkflowPackPage } from "@/components/studio/workflow/WorkflowPackPage";

type WorkflowPackRouteProps = {
  params: Promise<{ packId: string }>;
  searchParams: Promise<{
    scene?: string | string[];
    projectId?: string | string[];
  }>;
};

function queryValue(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export default async function WorkflowPackRoute({
  params,
  searchParams,
}: WorkflowPackRouteProps) {
  const [{ packId }, query] = await Promise.all([params, searchParams]);

  return (
    <WorkflowPackPage
      packId={packId}
      scene={queryValue(query.scene)}
      requestedProjectId={queryValue(query.projectId)}
    />
  );
}
