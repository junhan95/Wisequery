import sgMail from "@sendgrid/mail";

if (!process.env.SENDGRID_API_KEY) {
  console.warn("WARNING: SENDGRID_API_KEY not configured. Email functionality will not work.");
} else {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

const FROM_EMAIL = process.env.FROM_EMAIL || "noreply@yourdomain.com";

export async function sendVerificationEmail(
  to: string,
  code: string,
  firstName?: string
): Promise<void> {
  const msg = {
    to,
    from: FROM_EMAIL,
    subject: "Email Verification Code",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Email Verification</h2>
        ${firstName ? `<p>Hi ${firstName},</p>` : '<p>Hello,</p>'}
        <p>Thank you for signing up! Please use the following verification code to verify your email address:</p>
        <div style="background-color: #f4f4f4; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
          ${code}
        </div>
        <p>This code will expire in 10 minutes.</p>
        <p>If you didn't request this code, please ignore this email.</p>
      </div>
    `,
  };

  try {
    await sgMail.send(msg);
    console.log(`Verification email sent to ${to}`);
  } catch (error) {
    console.error("Error sending verification email:", error);
    throw new Error("Failed to send verification email");
  }
}

export async function sendPasswordResetEmail(
  to: string,
  code: string,
  firstName?: string
): Promise<void> {
  const msg = {
    to,
    from: FROM_EMAIL,
    subject: "Password Reset Code",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Password Reset Request</h2>
        ${firstName ? `<p>Hi ${firstName},</p>` : '<p>Hello,</p>'}
        <p>We received a request to reset your password. Please use the following code to reset your password:</p>
        <div style="background-color: #f4f4f4; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
          ${code}
        </div>
        <p>This code will expire in 10 minutes.</p>
        <p>If you didn't request this code, please ignore this email and your password will remain unchanged.</p>
      </div>
    `,
  };

  try {
    await sgMail.send(msg);
    console.log(`Password reset email sent to ${to}`);
  } catch (error) {
    console.error("Error sending password reset email:", error);
    throw new Error("Failed to send password reset email");
  }
}

export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function sendExpirationWarningEmail(
  to: string,
  conversationCount: number,
  fileCount: number,
  daysUntilExpiration: number
): Promise<void> {
  const itemsList: string[] = [];
  if (conversationCount > 0) {
    itemsList.push(`${conversationCount} conversation${conversationCount > 1 ? 's' : ''}`);
  }
  if (fileCount > 0) {
    itemsList.push(`${fileCount} file${fileCount > 1 ? 's' : ''}`);
  }

  const itemsText = itemsList.join(' and ');

  const msg = {
    to,
    from: FROM_EMAIL,
    subject: "WiseQuery: Your content will be archived soon",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Content Expiration Notice</h2>
        <p>Hello,</p>
        <p>This is a friendly reminder that ${itemsText} in your WiseQuery account will be archived in <strong>${daysUntilExpiration} days</strong> due to inactivity.</p>
        <div style="background-color: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 0;"><strong>What happens when content is archived?</strong></p>
          <ul style="margin: 10px 0 0 0; padding-left: 20px;">
            <li>Archived content is hidden from search results</li>
            <li>You can restore archived content within the grace period</li>
            <li>After the grace period, content is permanently deleted</li>
          </ul>
        </div>
        <p><strong>To prevent archiving:</strong></p>
        <ul>
          <li>Open your conversations to mark them as active</li>
          <li>View or download your files</li>
          <li>Consider upgrading your plan for longer retention periods</li>
        </ul>
        <p>
          <a href="${process.env.APP_URL || 'http://localhost:5000'}" 
             style="display: inline-block; background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
            Review Your Content
          </a>
        </p>
        <p style="color: #666; font-size: 12px; margin-top: 30px;">
          You're receiving this email because you have a WiseQuery account. 
          To change your notification preferences, visit your account settings.
        </p>
      </div>
    `,
  };

  try {
    await sgMail.send(msg);
    console.log(`Expiration warning email sent to ${to}`);
  } catch (error) {
    console.error("Error sending expiration warning email:", error);
    throw new Error("Failed to send expiration warning email");
  }
}
