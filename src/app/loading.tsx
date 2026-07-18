import { LoaderCircle } from "lucide-react";

export default function Loading() {
  return (
    <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-4 py-32 text-sm text-ink-500" role="status">
      <LoaderCircle className="h-4 w-4 animate-spin text-primary-500" />
      页面加载中
    </div>
  );
}
