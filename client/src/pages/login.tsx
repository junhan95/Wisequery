import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderTree } from "lucide-react";
import { SiGoogle, SiNaver, SiKakaotalk } from "react-icons/si";
import { PrefetchLink } from "@/components/prefetch-link";

export default function LoginPage() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <FolderTree className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold">WiseQuery</span>
          </div>
          <CardTitle className="text-2xl font-bold">
            {t("auth.login.title")}
          </CardTitle>
          <CardDescription>
            {t("auth.login.subtitle")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Google Login */}
          <Button
            variant="outline"
            className="w-full h-12 text-base gap-3"
            onClick={() => window.location.href = "/api/auth/google"}
            data-testid="button-login-google"
          >
            <SiGoogle className="h-5 w-5" />
            Google로 계속하기
          </Button>

          {/* Naver Login */}
          <Button
            variant="outline"
            className="w-full h-12 text-base gap-3 hover:bg-[#03C75A]/10 hover:border-[#03C75A]"
            onClick={() => window.location.href = "/api/auth/naver"}
            data-testid="button-login-naver"
          >
            <SiNaver className="h-5 w-5 text-[#03C75A]" />
            네이버로 계속하기
          </Button>

          {/* Kakao Login */}
          <Button
            variant="outline"
            className="w-full h-12 text-base gap-3 hover:bg-[#FEE500]/20 hover:border-[#FEE500]"
            onClick={() => window.location.href = "/api/auth/kakao"}
            data-testid="button-login-kakao"
          >
            <SiKakaotalk className="h-5 w-5 text-[#3C1E1E]" />
            카카오로 계속하기
          </Button>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            소셜 계정으로 간편하게 로그인하세요.
            <br />
            계정이 없으면 자동으로 생성됩니다.
          </p>

          <div className="text-center">
            <PrefetchLink href="/" className="text-sm text-muted-foreground hover:underline" data-testid="link-back-home">
              {t("common.backToHome")}
            </PrefetchLink>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
