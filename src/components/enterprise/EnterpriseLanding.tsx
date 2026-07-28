import EnterpriseAssessment from "./EnterpriseAssessment";
import EnterpriseFooter from "./EnterpriseFooter";
import EnterpriseHero from "./EnterpriseHero";
import EnterpriseMotion from "./EnterpriseMotion";
import EnterpriseNarrative from "./EnterpriseNarrative";
import EnterpriseNav from "./EnterpriseNav";
import "./enterprise-motion.css";

export default function EnterpriseLanding() {
  return (
    <div className="zen-landing">
      <EnterpriseMotion />
      <EnterpriseNav />
      <main>
        <EnterpriseHero />
        <EnterpriseNarrative />
        <EnterpriseAssessment />
      </main>
      <EnterpriseFooter />
    </div>
  );
}
