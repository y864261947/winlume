type Environment = Readonly<Record<string, string | undefined>>;

export function isMailConfigured(env: Environment = process.env): boolean {
  return Boolean(env.SMTP_HOST?.trim() && env.SMTP_FROM?.trim());
}

export interface TransactionalEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendTransactionalEmail(
  input: TransactionalEmail,
  env: Environment = process.env,
): Promise<boolean> {
  if (!isMailConfigured(env)) return false;
  const nodemailer = await import("nodemailer");
  const port = Number.parseInt(env.SMTP_PORT ?? "587", 10);
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number.isInteger(port) ? port : 587,
    secure: port === 465,
    auth: env.SMTP_USER?.trim()
      ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? "" }
      : undefined,
  });
  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
  return true;
}

export function verificationEmailCopy(code: string, purpose: "signup" | "password_reset") {
  const action = purpose === "signup" ? "完成注册" : "重置密码";
  const subject = `Reizo 验证码：${code}`;
  const text = `你的验证码是 ${code}。10 分钟内有效，用于${action}。如果不是你本人操作，请忽略这封邮件。`;
  const html = `
    <div style="font-family:ui-sans-serif,system-ui,sans-serif;line-height:1.5;color:#102244">
      <p style="margin:0 0 12px">你的 Reizo 验证码</p>
      <p style="margin:0 0 16px;font-size:28px;letter-spacing:0.24em;font-weight:650">${code}</p>
      <p style="margin:0;color:#566884;font-size:14px">10 分钟内有效，用于${action}。如果不是你本人操作，请忽略这封邮件。</p>
    </div>
  `;
  return { subject, text, html };
}
