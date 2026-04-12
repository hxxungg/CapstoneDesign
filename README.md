# 수행평가 AI 관리 앱

중·고등학생의 올바른 AI 사용을 위한 수행평가 관리 모바일 애플리케이션

## 주요 기능

### 학생 기능
- **인앱 브라우저**: AI가 허용된 단계에서만 ChatGPT, Gemini, Claude 등 접근 가능
- **단계별 AI 제한**: AI 허용 단계에서만 브라우저 활성화, 허용된 AI 도구 외 사이트 차단
- **앱 이탈 방지**: 뒤로가기/홈버튼 사용 시 경고 모달 표시 + 이탈 시도 기록
- **수행평가 코드 참여**: 교사가 발급한 코드로 수행평가 등록

### 교사 기능
- **수행평가 생성**: 제목, 과목, 설명 설정
- **단계별 AI 허용 설정**: 각 단계마다 AI 사용 여부, 허용 AI 도구, AI 활용 지침 설정
- **학생 AI 사용 로그 열람**: 방문 URL, 사용 시간, AI 도구별 사용 횟수, 이탈 시도 기록
- **종합 분석 대시보드**: 전체 학생 AI 사용 현황 한눈에 파악

---

## 프로젝트 구조

```
code/
├── backend/          # Node.js + Express 백엔드
│   ├── src/
│   │   ├── database.js
│   │   ├── middleware/auth.js
│   │   └── routes/
│   │       ├── auth.js
│   │       ├── assignments.js
│   │       ├── stages.js
│   │       ├── logs.js
│   │       └── analytics.js
│   ├── package.json
│   └── server.js
└── mobile/           # Expo React Native 앱
    ├── src/
    │   ├── config/api.js
    │   ├── context/AuthContext.js
    │   ├── navigation/AppNavigator.js
    │   ├── services/api.js
    │   ├── components/ExitWarningModal.js
    │   └── screens/
    │       ├── LoginScreen.js
    │       ├── RegisterScreen.js
    │       ├── student/
    │       │   ├── AssignmentListScreen.js
    │       │   ├── EnrollScreen.js
    │       │   ├── StageListScreen.js
    │       │   └── BrowserScreen.js
    │       └── teacher/
    │           ├── TeacherDashboard.js
    │           ├── CreateAssignmentScreen.js
    │           ├── AssignmentDetailScreen.js
    │           ├── CreateStageScreen.js
    │           ├── StudentLogsScreen.js
    │           └── AnalyticsScreen.js
    ├── App.js
    └── package.json
```

---

## 설치 및 실행

### 1. 백엔드 서버

```bash
cd code/backend

# 의존성 설치
npm install

# .env 파일 생성
cp .env.example .env

# 개발 서버 실행 (nodemon)
npm run dev

# 또는 일반 실행
npm start
```

서버가 `http://localhost:3000`에서 실행됩니다.

**기본 테스트 계정 (자동 생성)**
- 교사: `teacher@test.com` / `teacher123`
- 학생: `student@test.com` / `student123`
- 교사 코드: `TCH001`

---

### 2. 모바일 앱 (Expo)

```bash
cd code/mobile

# 의존성 설치
npm install

# Expo 개발 서버 실행
npm start
# 또는
npx expo start
```

**실기기에서 테스트할 경우** `src/config/api.js`의 API_BASE_URL을 PC의 실제 IP로 변경:
```js
// 예시
export const API_BASE_URL = 'http://192.168.1.100:3000/api';
```

---

## API 엔드포인트

| 메서드 | 경로 | 설명 | 권한 |
|--------|------|------|------|
| POST | /api/auth/register | 회원가입 | 없음 |
| POST | /api/auth/login | 로그인 | 없음 |
| GET | /api/auth/me | 내 정보 | 로그인 |
| GET | /api/auth/students | 담당 학생 목록 | 교사 |
| GET | /api/assignments | 수행평가 목록 | 로그인 |
| POST | /api/assignments | 수행평가 생성 | 교사 |
| GET | /api/assignments/:id | 수행평가 상세 | 로그인 |
| POST | /api/assignments/enroll | 수행평가 참여 | 학생 |
| PUT | /api/assignments/:id/progress | 단계 진행 업데이트 | 로그인 |
| GET | /api/assignments/:id/students | 참여 학생 목록 | 교사 |
| POST | /api/stages | 단계 생성 | 교사 |
| PUT | /api/stages/:id | 단계 수정 | 교사 |
| DELETE | /api/stages/:id | 단계 삭제 | 교사 |
| POST | /api/logs | AI 사용 로그 기록 | 학생 |
| POST | /api/logs/exit-attempt | 이탈 시도 기록 | 학생 |
| GET | /api/logs/student/:sId/assignment/:aId | 학생 로그 조회 | 교사 |
| GET | /api/analytics/assignment/:id | 수행평가 종합 분석 | 교사 |

---

## 기술 스택

**백엔드**
- Node.js + Express
- better-sqlite3 (파일 기반 SQLite DB)
- JWT 인증 (jsonwebtoken)
- bcryptjs (비밀번호 암호화)

**모바일**
- Expo (React Native)
- React Navigation v6
- react-native-webview (인앱 브라우저)
- Axios (HTTP 클라이언트)
- AsyncStorage (로컬 토큰 저장)

---

## 지원하는 AI 도구

| 도구 | URL |
|------|-----|
| ChatGPT | chat.openai.com |
| Google Gemini | gemini.google.com |
| Claude AI | claude.ai |
| Perplexity AI | perplexity.ai |
| Microsoft Copilot | copilot.microsoft.com |
| WRTN (뤼튼) | wrtn.ai |
