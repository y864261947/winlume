import Link from "next/link";
import { ArrowRight } from "lucide-react";
import styles from "./enterprise-portal.module.css";

type EnterprisePage =
  | "home"
  | "capabilities"
  | "cases"
  | "deployment"
  | "consultant"
  | "assessment";

const links: { id: Exclude<EnterprisePage, "assessment">; label: string; href: string }[] = [
  { id: "home", label: "企业版首页", href: "/business" },
  { id: "capabilities", label: "业务能力", href: "/business/capabilities" },
  { id: "cases", label: "客户案例", href: "/business/cases" },
  { id: "deployment", label: "AI 部署方向", href: "/business/deployment" },
  { id: "consultant", label: "咨询专员", href: "/business/consultant" },
];

export default function EnterprisePageNav({ active }: { active: EnterprisePage }) {
  return (
    <header className={styles.nav}>
      <Link className={styles.brand} href="/business" aria-label="Reizo 企业版首页">
        <span>R</span>Reizo
      </Link>
      <p>AI that works for real business</p>
      <Link className={styles.audienceSwitch} href="/">
        个人版 <ArrowRight aria-hidden />
      </Link>
      <nav aria-label="企业版导航">
        {links.map((link) => (
          <Link
            key={link.id}
            href={link.href}
            aria-current={active === link.id ? "page" : undefined}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <Link
        href="/business/assessment"
        className={styles.navAssessment}
        aria-current={active === "assessment" ? "page" : undefined}
      >
        免费评估
      </Link>
      <span className={styles.language}>中文 / EN</span>
    </header>
  );
}
