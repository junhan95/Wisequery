# WiseQuery 가격 정책 / Pricing Policy

## 플랜 개요 / Plan Overview

| 플랜 / Plan | 월간 가격 / Monthly | 연간 가격 / Yearly (per month) | 대상 / Target |
|-------------|---------------------|-------------------------------|---------------|
| **Starter (무료)** | $0 | $0 | 개인 사용자 체험용 |
| **Core (베이직)** | $25 | $20 | 개인 전문가 |
| **Teams (프로)** | $40 | $35 | 팀 및 중소기업 |
| **Enterprise (Custom)** | 맞춤형 | 맞춤형 | 대기업 |

---

## 상세 플랜 정보 / Detailed Plan Information

### Starter (무료) - Free
- **가격**: $0/월
- **대상**: WiseQuery를 처음 사용하는 개인
- **기능**:
  - 3개 프로젝트
  - 50개 대화
  - 50GB 저장공간
  - 기본 RAG 검색
  - 커뮤니티 지원

### Core (베이직) - Basic
- **가격**: 월 $25 / 연간 결제 시 월 $20
- **대상**: 더 많은 기능이 필요한 개인 전문가
- **기능**:
  - 10개 프로젝트
  - 무제한 대화
  - 100GB 저장공간
  - 기본 RAG 검색
  - 이메일 지원

### Teams (프로) - Pro
- **가격**: 월 $40 / 연간 결제 시 월 $35
- **대상**: 팀 협업이 필요한 중소기업
- **기능**:
  - Core의 모든 기능
  - 무제한 프로젝트
  - 500GB 저장공간
  - 고급 RAG 검색 (GPT-5)
  - 이미지 생성 기능
  - 우선 지원

### Enterprise (Custom)
- **가격**: 맞춤형 (영업팀 문의)
- **대상**: 보안 및 성능 요구사항이 있는 대기업
- **기능**:
  - Teams의 모든 기능
  - 맞춤형 저장 한도
  - SSO/SAML 통합
  - SCIM 프로비저닝
  - 전담 지원
  - SLA 보장

---

## 결제 정보 / Billing Information

### 결제 주기
- **월간 결제**: 매월 갱신, 언제든지 취소 가능
- **연간 결제**: 12개월 선결제, 월간 대비 약 20% 할인

### 결제 수단
- Stripe를 통한 안전한 결제
- 신용카드/체크카드 지원

### 환불 정책
- 언제든지 취소 가능
- 구독 기간 종료 시까지 서비스 이용 가능

---

## Stripe 가격 ID 설정 / Stripe Price ID Configuration

개발자를 위한 Stripe 가격 ID 환경변수:

```
STRIPE_BASIC_MONTHLY_PRICE_ID=price_xxx  # Core 월간 ($25)
STRIPE_BASIC_YEARLY_PRICE_ID=price_xxx   # Core 연간 ($20/월)
STRIPE_PRO_MONTHLY_PRICE_ID=price_xxx    # Teams 월간 ($40)
STRIPE_PRO_YEARLY_PRICE_ID=price_xxx     # Teams 연간 ($35/월)
```

---

*Last updated: 2024-12-05*
