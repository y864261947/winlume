import ReizoHeader from "@/components/reizo/ReizoHeader";
import ReizoFooter from "@/components/reizo/ReizoFooter";
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <div className="reizo-site reizo-page-support"><ReizoHeader /><main className="reizo-legacy-content">{children}</main><ReizoFooter /></div>;
}
