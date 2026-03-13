import crypto from "crypto";

/**
 * Solapi SMS 서비스
 * HMAC-SHA256 서명 방식으로 인증
 * https://developers.solapi.com/references/messages-v4
 */

const SOLAPI_API_URL = "https://api.solapi.com/messages/v4/send";

function generateSignature(apiKey: string, apiSecret: string): string {
    const date = new Date().toISOString();
    const salt = crypto.randomBytes(16).toString("hex");
    const data = `${date}${salt}`;
    const signature = crypto.createHmac("sha256", apiSecret).update(data).digest("hex");
    return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

export async function sendSmsVerificationCode(phone: string, code: string): Promise<void> {
    const apiKey = process.env.SOLAPI_API_KEY;
    const apiSecret = process.env.SOLAPI_API_SECRET;
    const senderPhone = process.env.SOLAPI_SENDER_PHONE;

    if (!apiKey || !apiSecret || !senderPhone) {
        throw new Error("Solapi 환경변수가 설정되지 않았습니다 (SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER_PHONE)");
    }

    // 010-1234-5678 → 01012345678 형식 정규화
    const normalizedPhone = phone.replace(/[^0-9]/g, "");

    const body = {
        message: {
            to: normalizedPhone,
            from: senderPhone.replace(/[^0-9]/g, ""),
            text: `[WiseQuery] 인증번호: ${code}\n5분 내에 입력해주세요.`,
        },
    };

    const response = await fetch(SOLAPI_API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: generateSignature(apiKey, apiSecret),
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("Solapi 오류:", errorText);
        throw new Error(`SMS 발송 실패: ${response.status}`);
    }
}

export function generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
}
