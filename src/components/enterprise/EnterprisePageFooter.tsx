import Image from "next/image";
import Link from "next/link";
import styles from "./enterprise-portal.module.css";

export default function EnterprisePageFooter() {
  return (
    <footer className={styles.footer}>
      <strong><Image className={styles.footerMark} src="/brand/reizo-mark.png" alt="" width={24} height={24} />REIZO</strong>
      <span>© 2026 Reizo. 保留所有权利。</span>
      <nav aria-label="企业版页脚导航">
        <Link href="/business/capabilities">产品能力</Link>
        <Link href="/business/deployment">解决方案</Link>
        <Link href="/business/cases">资源中心</Link>
        <Link href="/business/consultant">联系我们</Link>
      </nav>
    </footer>
  );
}
