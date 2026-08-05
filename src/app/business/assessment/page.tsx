import EnterpriseAssessment from "@/components/enterprise/EnterpriseAssessment";
import styles from "@/components/enterprise/enterprise-portal.module.css";

export default function BusinessAssessmentPage() { return <main className={styles.directory}><section className={styles.directoryHero}><p className={styles.eyebrow}>AI READINESS</p><h1>从一个业务问题，开始 AI 评估。</h1><span>回答几个与流程、数据和约束有关的问题，获得第一阶段的建议与 90 天推进方向。</span></section><section className={styles.assessmentShell}><EnterpriseAssessment /></section></main>; }
