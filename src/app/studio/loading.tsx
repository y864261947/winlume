import { LoaderCircle } from "lucide-react";

/** Studio-segment loading — keeps sidebar chrome from layout visible when possible. */
export default function StudioLoading() {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-sm text-[#8A8298]"
      role="status"
    >
      <LoaderCircle className="h-5 w-5 animate-spin text-[#C2410C]" />
      正在打开工作台…
    </div>
  );
}
