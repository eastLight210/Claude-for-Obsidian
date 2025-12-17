# Obsidian Claude Code Plugin 개발 계획서

## 1. 프로젝트 개요

### 1.1 목적
Obsidian 사이드바에서 Claude Code CLI를 실행하여 문서 분석, 작성, 편집 기능을 제공하는 플러그인 개발

### 1.2 핵심 가치
- **API 키 불필요**: Claude Pro 구독 계정으로 로그인하여 사용
- **네이티브 통합**: Obsidian의 Vault 시스템과 자연스럽게 연동
- **실시간 상호작용**: 터미널 기반의 스트리밍 응답 지원

### 1.3 전제 조건
- 사용자 PC에 Claude Code CLI 설치 및 로그인 완료
- Obsidian v1.0.0 이상

---

## 2. 기술 스택

| 구분 | 기술 |
|------|------|
| 플러그인 언어 | TypeScript |
| 빌드 도구 | esbuild |
| CLI 통신 | Node.js `child_process` |
| UI 프레임워크 | Obsidian API (ItemView) |
| 스타일링 | CSS (Obsidian 테마 호환) |

---

## 3. 아키텍처

```
┌────────────────────────────────────────────────────────────┐
│                    Obsidian Application                    │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌──────────────┐    ┌─────────────────────────────────┐  │
│  │              │    │        Claude Plugin             │  │
│  │   Vault      │◄──►│  ┌───────────────────────────┐  │  │
│  │   Files      │    │  │     ClaudeService         │  │  │
│  │              │    │  │  - spawn claude process   │  │  │
│  └──────────────┘    │  │  - handle stdin/stdout    │  │  │
│                      │  │  - manage sessions        │  │  │
│  ┌──────────────┐    │  └───────────────────────────┘  │  │
│  │   Active     │    │              ▲                   │  │
│  │   Editor     │◄──►│              │                   │  │
│  │              │    │              ▼                   │  │
│  └──────────────┘    │  ┌───────────────────────────┐  │  │
│                      │  │     ClaudeView (UI)       │  │  │
│                      │  │  - Chat interface         │  │  │
│                      │  │  - Message history        │  │  │
│                      │  │  - Action buttons         │  │  │
│                      │  └───────────────────────────┘  │  │
│                      └─────────────────────────────────┘  │
│                                                            │
└────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  Claude Code    │
                    │     CLI         │
                    │  (Terminal)     │
                    └─────────────────┘
```

---

## 4. 주요 기능

### 4.1 핵심 기능

| 기능 | 설명 | 우선순위 |
|------|------|----------|
| 사이드바 채팅 | Claude와 대화할 수 있는 채팅 인터페이스 | P0 |
| 현재 문서 전달 | 열린 문서를 컨텍스트로 Claude에게 전달 | P0 |
| 스트리밍 응답 | 실시간으로 Claude 응답 표시 | P0 |
| 응답 삽입 | Claude 응답을 현재 문서에 삽입 | P1 |
| 선택 텍스트 분석 | 선택한 텍스트만 Claude에게 전달 | P1 |
| 대화 히스토리 | 세션 내 대화 내역 유지 | P1 |

### 4.2 확장 기능 (추후 개발)

| 기능 | 설명 | 우선순위 |
|------|------|----------|
| Vault 검색 | 관련 노트를 찾아 컨텍스트로 활용 | P2 |
| 템플릿 프롬프트 | 자주 쓰는 프롬프트 저장/실행 | P2 |
| 문서 자동 생성 | Claude 응답을 새 노트로 저장 | P2 |
| 다중 파일 컨텍스트 | 여러 파일을 한번에 전달 | P3 |

---

## 5. UI/UX 설계

### 5.1 사이드바 레이아웃

```
┌─────────────────────────────────┐
│ 🤖 Claude                   [⚙]│  ← 헤더 (설정 버튼)
├─────────────────────────────────┤
│                                 │
│  ┌───────────────────────────┐  │
│  │ 👤 사용자                 │  │
│  │ 이 문서를 요약해줘        │  │
│  └───────────────────────────┘  │
│                                 │
│  ┌───────────────────────────┐  │
│  │ 🤖 Claude                 │  │
│  │ 이 문서는 Obsidian       │  │
│  │ 플러그인 개발에 대한...   │  │
│  │                           │  │
│  │ [문서에 삽입] [복사]      │  │  ← 액션 버튼
│  └───────────────────────────┘  │
│                                 │
│         ... 대화 히스토리 ...    │
│                                 │
├─────────────────────────────────┤
│ [📄 현재 문서 포함]  [🔍 선택] │  ← 컨텍스트 옵션
├─────────────────────────────────┤
│ ┌─────────────────────────┐ [→]│  ← 입력창
│ │ 메시지를 입력하세요...   │    │
│ └─────────────────────────┘    │
└─────────────────────────────────┘
```

### 5.2 사용자 흐름

```
사용자가 사이드바 열기
        │
        ▼
┌───────────────────┐
│ Claude CLI 상태   │
│ 확인              │
└───────────────────┘
        │
   ┌────┴────┐
   │         │
  설치됨   미설치
   │         │
   ▼         ▼
채팅 활성화  설치 안내 표시
   │
   ▼
메시지 입력 + 컨텍스트 선택
   │
   ▼
Claude CLI 실행 (spawn)
   │
   ▼
스트리밍 응답 표시
   │
   ▼
액션 버튼으로 후속 작업
```

---

## 6. 구현 단계

### Phase 1: 기본 구조 (1-2일)
- [ ] 플러그인 보일러플레이트 설정
- [ ] 사이드바 View 클래스 생성
- [ ] 기본 UI 레이아웃 구현
- [ ] 설정 패널 구현 (Claude CLI 경로 설정)

### Phase 2: Claude CLI 통합 (2-3일)
- [ ] ClaudeService 클래스 구현
- [ ] `child_process.spawn` 으로 CLI 실행
- [ ] stdin/stdout 스트림 처리
- [ ] 에러 핸들링

### Phase 3: 채팅 기능 (2-3일)
- [ ] 메시지 입력 및 전송
- [ ] 스트리밍 응답 렌더링 (마크다운 지원)
- [ ] 대화 히스토리 관리
- [ ] 로딩 상태 표시

### Phase 4: Obsidian 통합 (2-3일)
- [ ] 현재 문서 내용 가져오기
- [ ] 선택 텍스트 가져오기
- [ ] 응답을 문서에 삽입
- [ ] 새 노트로 저장

### Phase 5: 마무리 (1-2일)
- [ ] UI 폴리싱
- [ ] 테마 호환성 테스트
- [ ] 에러 메시지 개선
- [ ] README 작성

**예상 총 개발 기간: 8-13일**

---

## 7. 파일 구조

```
obsidian-claude-plugin/
├── manifest.json           # 플러그인 메타데이터
├── package.json
├── tsconfig.json
├── esbuild.config.mjs      # 빌드 설정
├── styles.css              # 플러그인 스타일
│
├── src/
│   ├── main.ts             # 플러그인 진입점
│   │
│   ├── services/
│   │   └── ClaudeService.ts    # Claude CLI 통신 담당
│   │
│   ├── views/
│   │   └── ClaudeView.ts       # 사이드바 UI
│   │
│   ├── components/
│   │   ├── ChatMessage.ts      # 메시지 컴포넌트
│   │   ├── InputArea.ts        # 입력 영역
│   │   └── ActionButtons.ts    # 액션 버튼들
│   │
│   ├── settings/
│   │   └── SettingsTab.ts      # 설정 탭
│   │
│   └── types/
│       └── index.ts            # 타입 정의
│
└── README.md
```

---

## 8. 핵심 코드 설계

### 8.1 ClaudeService 클래스

```typescript
// 예상 인터페이스
class ClaudeService {
  private process: ChildProcess | null;
  
  // Claude CLI 실행 가능 여부 확인
  async checkAvailability(): Promise<boolean>;
  
  // 메시지 전송 및 스트리밍 응답
  async sendMessage(
    message: string, 
    context?: string,
    onChunk: (chunk: string) => void
  ): Promise<string>;
  
  // 프로세스 종료
  abort(): void;
}
```

### 8.2 Claude CLI 호출 방식

```typescript
// 방법 1: -p 플래그로 단일 프롬프트 실행
spawn('claude', ['-p', prompt]);

// 방법 2: 파이프로 컨텍스트 전달
const proc = spawn('claude', ['-p', question]);
proc.stdin.write(documentContent);
proc.stdin.end();

// 방법 3: 인터랙티브 모드 (세션 유지)
// 추후 조사 필요 - 대화 연속성을 위해
```

---

## 9. 예상 문제점 및 해결책

| 문제 | 원인 | 해결책 |
|------|------|--------|
| Claude CLI 경로를 못 찾음 | 시스템 PATH에 없음 | 설정에서 수동 경로 지정 옵션 |
| 긴 문서 처리 시 타임아웃 | CLI 응답 지연 | 타임아웃 설정 + 프로그레스 표시 |
| 스트리밍 출력 깨짐 | 버퍼링 문제 | stdout을 line 단위로 처리 |
| 특수문자가 포함된 프롬프트 | 쉘 이스케이프 | 인자 배열로 전달 (spawn) |
| 동시 요청 충돌 | 여러 요청 겹침 | 요청 큐 또는 이전 요청 취소 |
| 한글 인코딩 | UTF-8 처리 | 명시적 인코딩 설정 |

---

## 10. 설정 옵션

```typescript
interface ClaudePluginSettings {
  // Claude CLI 경로 (기본: 'claude')
  claudePath: string;
  
  // 기본 컨텍스트 포함 여부
  includeCurrentNote: boolean;
  
  // 최대 컨텍스트 길이 (토큰)
  maxContextLength: number;
  
  // 응답 자동 복사
  autoCopyResponse: boolean;
  
  // 대화 히스토리 유지 개수
  historyLimit: number;
}
```

---

## 11. 향후 확장 가능성

1. **MCP (Model Context Protocol) 연동**
   - Obsidian Vault를 MCP 서버로 노출
   - Claude가 직접 파일 시스템 접근

2. **RAG 기능**
   - 로컬 임베딩으로 관련 노트 검색
   - 컨텍스트 자동 구성

3. **커맨드 팔레트 통합**
   - 빠른 프롬프트 실행
   - 키보드 단축키 지원

4. **템플릿 시스템**
   - 문서 유형별 프롬프트 템플릿
   - 변수 치환 지원

---

## 12. 참고 자료

- [Obsidian Plugin Developer Docs](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)
- [Obsidian Sample Plugin](https://github.com/obsidianmd/obsidian-sample-plugin)
- [Claude Code CLI Documentation](https://docs.anthropic.com/en/docs/claude-code)
- [Node.js child_process](https://nodejs.org/api/child_process.html)

---

## 13. 다음 단계

1. ✅ 계획 문서 작성 (현재)
2. ⬜ 플러그인 기본 구조 생성
3. ⬜ ClaudeService 구현
4. ⬜ UI 구현
5. ⬜ 테스트 및 디버깅
6. ⬜ 배포