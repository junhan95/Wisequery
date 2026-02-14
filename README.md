<p align="center">
  <img src="https://img.shields.io/badge/WiseQuery-AI%20Knowledge%20Platform-6366f1?style=for-the-badge&logoColor=white" alt="WiseQuery" />
</p>

<h1 align="center">🧠 WiseQuery</h1>

<p align="center">
  <strong>AI 기반 지식 관리 플랫폼</strong><br/>
  프로젝트별로 대화를 정리하고, 어디서든 질문하세요.<br/>
  고급 RAG 기술로 전체 지식 베이스에서 답변을 얻으세요.
</p>

<p align="center">
  <a href="https://wisequery.app">
    <img src="https://img.shields.io/badge/🌐_Live_Demo-wisequery.app-6366f1?style=for-the-badge" alt="Live Demo" />
  </a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/React_18-61DAFB?style=flat-square&logo=react&logoColor=black" />
  <img src="https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white" />
  <img src="https://img.shields.io/badge/Express-000000?style=flat-square&logo=express&logoColor=white" />
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white" />
  <img src="https://img.shields.io/badge/Supabase-3FCF8E?style=flat-square&logo=supabase&logoColor=white" />
  <img src="https://img.shields.io/badge/OpenAI-412991?style=flat-square&logo=openai&logoColor=white" />
  <img src="https://img.shields.io/badge/Stripe-635BFF?style=flat-square&logo=stripe&logoColor=white" />
  <img src="https://img.shields.io/badge/Render-46E3B7?style=flat-square&logo=render&logoColor=black" />
</p>

---

## ✨ Overview

**WiseQuery**는 Windows Explorer 스타일의 AI 채팅 애플리케이션입니다. 프로젝트 → 폴더 → 대화의 계층 구조로 지식을 정리하고, 업로드한 문서를 기반으로 AI와 대화할 수 있습니다. 시맨틱 검색(RAG)으로 전체 지식 베이스에서 관련 맥락을 찾아 정확한 답변을 제공합니다.

---

## 🎯 Key Features

### 💬 AI 대화 & RAG
- **OpenAI GPT** 기반 실시간 스트리밍 채팅
- **시맨틱 검색 (RAG)**: pgvector + 코사인 유사도로 업로드 문서에서 관련 컨텍스트 자동 검색
- **문서 청킹 & 임베딩**: 업로드 파일을 자동으로 청크 분할 → 벡터 임베딩 생성
- **멀티모달 지원**: 이미지, PDF, Word, Excel, PowerPoint 파일 분석

### 📁 Explorer 스타일 UI
- **프로젝트 → 폴더 → 대화** 3단계 계층형 파일 트리
- **드래그 앤 드롭** 폴더/대화 이동 (dnd-kit)
- **우클릭 컨텍스트 메뉴** 지원
- **휴지통** 및 파일 복원 기능

### 🔐 인증 & 보안
- **소셜 로그인**: Google · 네이버 · 카카오 OAuth 2.0
- **세션 기반 인증**: Passport.js + PostgreSQL 세션 스토어
- **bcrypt** 비밀번호 해싱

### 💳 SaaS 구독 (Stripe)
| Plan | Projects | Conversations | Storage | AI Features |
|------|----------|--------------|---------|-------------|
| **Free** | 3 | 30 | 10 GB | Basic |
| **Basic** | 10 | Unlimited | 50 GB | Enhanced |
| **Pro** | Unlimited | Unlimited | 100 GB | Full + Image Gen |
| **Custom** | Unlimited | Unlimited | Unlimited | Enterprise |

### 🌍 다국어 & UX
- **한국어 / English** i18n 지원 (i18next)
- **다크 모드 / 라이트 모드** 토글 (next-themes)
- **반응형 디자인** (모바일 최적화)

---

## 🏗️ Architecture

```
WiseQuery/
├── client/                 # 🎨 Frontend (React + Vite)
│   ├── src/
│   │   ├── pages/          # Landing, Home, Pricing, Login...
│   │   ├── components/     # UI Components (shadcn/ui)
│   │   ├── hooks/          # Custom React Hooks
│   │   └── lib/            # Utilities & API client
│   └── index.html
│
├── server/                 # ⚙️ Backend (Express + TypeScript)
│   ├── routes/             # Modular API routes
│   │   ├── auth.routes.ts
│   │   ├── files.routes.ts
│   │   ├── stripe.routes.ts
│   │   └── ...
│   ├── storage/            # Data access layer (Drizzle ORM)
│   │   ├── users.storage.ts
│   │   ├── files.storage.ts
│   │   ├── vector.storage.ts
│   │   └── ...
│   ├── sessionAuth.ts      # Session authentication
│   ├── socialAuth.ts       # OAuth (Google, Naver, Kakao)
│   ├── stripe.ts           # Payment integration
│   ├── openai.ts           # AI & Embedding
│   └── supabaseStorage.ts  # File storage (Supabase)
│
├── shared/                 # 📦 Shared types & schema
│   └── schema.ts           # Drizzle ORM schema + Zod types
│
└── package.json
```

---

## 🛠️ Tech Stack

### Frontend
| Technology | Purpose |
|------------|---------|
| **React 18** | UI Framework (SPA) |
| **Vite** | Build tool & dev server |
| **TypeScript** | Type safety |
| **Tailwind CSS** | Styling |
| **shadcn/ui** | UI component library |
| **Wouter** | Client-side routing |
| **TanStack Query** | Server state management |
| **Framer Motion** | Animations |
| **i18next** | Internationalization |
| **Recharts** | Data visualization |

### Backend
| Technology | Purpose |
|------------|---------|
| **Express** | HTTP server |
| **Passport.js** | Authentication (Session + OAuth) |
| **Drizzle ORM** | Database ORM (type-safe) |
| **OpenAI API** | GPT chat + text-embedding-3-small |
| **Stripe** | Subscription billing |
| **Supabase Storage** | File upload & storage |
| **node-cron** | Scheduled tasks |

### Infrastructure
| Service | Purpose |
|---------|---------|
| **Neon PostgreSQL** | Primary database (pgvector) |
| **Supabase** | File storage & pooling |
| **Render** | Hosting & deployment |
| **GitHub** | Version control & CI/CD |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 20+ 
- **PostgreSQL** 15+ (with pgvector extension)
- **npm** 9+

### 1. Clone & Install

```bash
git clone https://github.com/junhan95/Wisequery.git
cd Wisequery
npm install
```

### 2. Environment Variables

`.env` 파일을 프로젝트 루트에 생성합니다:

```env
# Database
DATABASE_URL=postgresql://user:password@host:5432/dbname

# Session
SESSION_SECRET=your-secret-key

# OpenAI
OPENAI_API_KEY=sk-...

# Supabase Storage
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_STORAGE_BUCKET=wisequery-files

# App
APP_URL=http://localhost:5000

# OAuth - Google
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# OAuth - Naver (optional)
NAVER_CLIENT_ID=your-naver-client-id
NAVER_CLIENT_SECRET=your-naver-client-secret

# OAuth - Kakao (optional)
KAKAO_CLIENT_ID=your-kakao-rest-api-key
KAKAO_CLIENT_SECRET=your-kakao-client-secret

# Stripe (optional)
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### 3. Database Setup

```bash
npm run db:push     # Drizzle schema → PostgreSQL
```

### 4. Run Development Server

```bash
npm run dev         # Starts on http://localhost:5000
```

### 5. Production Build

```bash
npm run build       # Vite frontend + esbuild backend
npm start           # Runs production bundle
```

---

## 📡 API Endpoints

| Module | Endpoints | Auth |
|--------|-----------|------|
| **Auth** | `GET /api/auth/user` `GET /api/auth/google\|naver\|kakao` | ✅ |
| **Projects** | CRUD `/api/projects` | ✅ |
| **Folders** | CRUD `/api/folders` | ✅ |
| **Conversations** | CRUD `/api/conversations` | ✅ |
| **Files** | Upload/Download/Delete `/api/files` | ✅ |
| **Chat** | `POST /api/chat` (SSE streaming) | ✅ |
| **Search** | `POST /api/search` (semantic) | ✅ |
| **Stripe** | Subscription/Checkout/Webhook | ✅/🔓 |
| **Admin** | User management `/api/admin` | ✅👑 |
| **Trash** | Soft delete & restore | ✅ |

---

## 🔍 RAG Pipeline

```mermaid
flowchart LR
    A[📄 Upload] --> B[📝 Extract Text]
    B --> C[✂️ Chunk]
    C --> D[🧮 Embed<br/>text-embedding-3-small]
    D --> E[(🗄️ pgvector)]
    
    F[💬 User Query] --> G[🧮 Query Embed]
    G --> H{🔍 Cosine<br/>Similarity}
    E --> H
    H --> I[📋 Top-K Chunks]
    I --> J[🤖 GPT + Context]
    J --> K[💡 Answer]
```

1. **문서 업로드** → PDF/Word/Excel/PowerPoint 텍스트 추출
2. **청킹** → 토큰 기반 청크 분할 (metadata 포함)
3. **임베딩** → OpenAI `text-embedding-3-small` (1536차원)
4. **저장** → PostgreSQL pgvector 확장
5. **질의** → 코사인 유사도 Top-K → GPT 컨텍스트 주입

---

## 🚢 Deployment

### Render (Recommended)

이 프로젝트는 `render.yaml`이 포함되어 있어 Render에 원클릭 배포가 가능합니다.

| Setting | Value |
|---------|-------|
| **Build Command** | `npm install --include=dev; npm run build` |
| **Start Command** | `npm start` |
| **Node Version** | 20+ |

---

## 📄 License

This project is licensed under the **MIT License**.

---

<p align="center">
  <sub>Built with ❤️ by <a href="https://github.com/junhan95">junhan95</a></sub>
</p>
