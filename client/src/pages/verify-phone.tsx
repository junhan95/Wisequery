import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderTree, Phone, ShieldCheck, Loader2 } from "lucide-react";

type Step = "phone" | "code";

export default function VerifyPhonePage() {
    const [, navigate] = useLocation();
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const [step, setStep] = useState<Step>("phone");
    const [phone, setPhone] = useState("");
    const [code, setCode] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);
    const [countdown, setCountdown] = useState(0);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    function formatPhoneDisplay(value: string) {
        const digits = value.replace(/[^0-9]/g, "").slice(0, 11);
        if (digits.length <= 3) return digits;
        if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
        return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    }

    function startCountdown() {
        if (timerRef.current) clearInterval(timerRef.current);
        setCountdown(300); // 5분
        timerRef.current = setInterval(() => {
            setCountdown((c) => {
                if (c <= 1) {
                    clearInterval(timerRef.current!);
                    return 0;
                }
                return c - 1;
            });
        }, 1000);
    }

    async function handleSendCode() {
        const digits = phone.replace(/[^0-9]/g, "");
        if (!/^(010|011|016|017|018|019)\d{7,8}$/.test(digits)) {
            toast({ variant: "destructive", title: "올바른 휴대폰 번호를 입력해주세요." });
            return;
        }

        setIsSending(true);
        try {
            const res = await fetch("/api/auth/phone/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phone: digits }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            toast({ title: "인증번호를 전송했습니다.", description: "5분 내에 입력해주세요." });
            setStep("code");
            startCountdown();
        } catch (err: any) {
            toast({ variant: "destructive", title: "전송 실패", description: err.message });
        } finally {
            setIsSending(false);
        }
    }

    async function handleVerifyCode() {
        if (code.length !== 6) {
            toast({ variant: "destructive", title: "6자리 인증번호를 입력해주세요." });
            return;
        }

        setIsVerifying(true);
        try {
            const res = await fetch("/api/auth/phone/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phone: phone.replace(/[^0-9]/g, ""), code }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            // 사용자 캐시 무효화 후 홈으로 이동
            await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });

            if (data.merged) {
                toast({
                    title: "계정이 연결되었습니다.",
                    description: "기존 계정으로 로그인되었습니다.",
                });
            } else {
                toast({ title: "휴대폰 인증 완료", description: "WiseQuery를 시작하세요!" });
            }

            navigate("/");
        } catch (err: any) {
            toast({ variant: "destructive", title: "인증 실패", description: err.message });
        } finally {
            setIsVerifying(false);
        }
    }

    const countdownDisplay = countdown > 0
        ? `${Math.floor(countdown / 60)}:${String(countdown % 60).padStart(2, "0")}`
        : null;

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
            <Card className="w-full max-w-md">
                <CardHeader className="space-y-1 text-center">
                    <div className="flex items-center justify-center gap-2 mb-4">
                        <FolderTree className="h-8 w-8 text-primary" />
                        <span className="text-2xl font-bold">WiseQuery</span>
                    </div>
                    <CardTitle className="text-xl font-bold flex items-center justify-center gap-2">
                        <ShieldCheck className="h-5 w-5 text-primary" />
                        휴대폰 번호 인증
                    </CardTitle>
                    <CardDescription>
                        {step === "phone"
                            ? "같은 번호로 가입된 계정이 있으면 자동으로 연결됩니다."
                            : `${formatPhoneDisplay(phone)}으로 전송된 6자리 인증번호를 입력하세요.`}
                    </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                    {step === "phone" ? (
                        <>
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        className="pl-9"
                                        placeholder="010-0000-0000"
                                        value={formatPhoneDisplay(phone)}
                                        onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, ""))}
                                        maxLength={13}
                                        inputMode="numeric"
                                    />
                                </div>
                                <Button onClick={handleSendCode} disabled={isSending} className="shrink-0">
                                    {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : "인증번호 전송"}
                                </Button>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="space-y-2">
                                <div className="flex gap-2">
                                    <Input
                                        placeholder="인증번호 6자리"
                                        value={code}
                                        onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                                        maxLength={6}
                                        inputMode="numeric"
                                        className="text-center text-lg tracking-widest"
                                    />
                                    {countdownDisplay && (
                                        <span className="flex items-center text-sm text-muted-foreground shrink-0 w-12">
                                            {countdownDisplay}
                                        </span>
                                    )}
                                </div>
                                {countdown === 0 && (
                                    <p className="text-xs text-destructive">인증번호가 만료되었습니다.</p>
                                )}
                            </div>

                            <Button
                                className="w-full"
                                onClick={handleVerifyCode}
                                disabled={isVerifying || code.length !== 6}
                            >
                                {isVerifying ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                확인
                            </Button>

                            <Button
                                variant="ghost"
                                className="w-full text-sm"
                                onClick={() => { setStep("phone"); setCode(""); setCountdown(0); }}
                            >
                                번호 다시 입력
                            </Button>
                        </>
                    )}

                    <p className="text-xs text-muted-foreground text-center pt-2">
                        휴대폰 번호는 계정 연동에만 사용되며 외부에 공유되지 않습니다.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
