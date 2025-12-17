export const TIMEOUTS = {
  MESSAGE: 300000,
  VERSION_CHECK: 10000,
} as const;

export const UI_LIMITS = {
  TEXTAREA_MAX_HEIGHT: 120,
} as const;

export type MessageRole = 'user' | 'assistant';

/**
 * 채팅 메시지 인터페이스
 */
export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  responseTimeMs?: number;
}

/**
 * 플러그인 설정 인터페이스
 */
export interface ClaudePluginSettings {
  /** Claude CLI 경로 (기본: 'claude') */
  claudePath: string;
  /** 기본적으로 현재 문서 포함 여부 */
  includeCurrentNote: boolean;
  /** 최대 컨텍스트 길이 (문자 수) */
  maxContextLength: number;
  /** 응답 자동 복사 여부 */
  autoCopyResponse: boolean;
  /** 대화 히스토리 유지 개수 */
  historyLimit: number;
  /** 읽기 전용 도구 자동 승인 */
  autoApproveReadOnly: boolean;
  /** 세션 동안 승인한 도구 기억 */
  rememberApprovedTools: boolean;
  /** 시스템 프롬프트 (매 요청 앞에 추가) */
  systemPrompt: string;
}

/**
 * 기본 설정값
 */
export const DEFAULT_SETTINGS: ClaudePluginSettings = {
  claudePath: 'claude',
  includeCurrentNote: true,
  maxContextLength: 50000,
  autoCopyResponse: false,
  historyLimit: 50,
  autoApproveReadOnly: true,
  rememberApprovedTools: true,
  systemPrompt: `Obsidian vault 탐색 시:
1. 먼저 obsidian_list_files_in_vault로 전체 구조 파악
2. 또는 obsidian_simple_search로 폴더/파일 검색
3. 불필요한 반복 탐색 하지 말 것`,
};

/**
 * Claude CLI 상태
 */
export type ClaudeStatus = 'ready' | 'not_installed' | 'not_authenticated' | 'error';

/**
 * Claude CLI 상태 정보
 */
export interface ClaudeStatusInfo {
  status: ClaudeStatus;
  message?: string;
  version?: string;
}

/**
 * 컨텍스트 타입
 */
export type ContextType = 'none' | 'document' | 'selection';

/**
 * 메시지 전송 옵션
 */
export interface SendMessageOptions {
  /** 사용자 메시지 */
  message: string;
  /** 컨텍스트 내용 (문서 또는 선택 텍스트) */
  context?: string;
  /** 컨텍스트 타입 */
  contextType?: ContextType;
  /** 파일명 (컨텍스트 제공 시) */
  fileName?: string;
}

/**
 * 스트리밍 콜백 함수 타입
 */
export type StreamCallback = (chunk: string) => void;

/**
 * Claude 응답 결과
 */
export interface ClaudeResponse {
  success: boolean;
  content?: string;
  error?: string;
}

/**
 * 에러 타입
 */
export type ClaudeErrorType = 
  | 'CLI_NOT_FOUND'
  | 'NOT_AUTHENTICATED'
  | 'TIMEOUT'
  | 'RATE_LIMIT'
  | 'CONTEXT_TOO_LARGE'
  | 'UNKNOWN';

/**
 * Claude 에러 인터페이스
 */
export interface ClaudeError {
  type: ClaudeErrorType;
  message: string;
  originalError?: Error;
}

/**
 * 뷰 상태
 */
export interface ViewState {
  messages: ChatMessage[];
  isLoading: boolean;
  includeDocument: boolean;
  includeSelection: boolean;
  error?: ClaudeError;
}

/**
 * Claude CLI stream-json 메시지 타입
 */
export type StreamMessageType =
  | 'system'
  | 'assistant'
  | 'user'
  | 'result';

/**
 * 도구 사용 요청 정보
 */
export interface ToolUseRequest {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * 권한 요청 정보 (사용자에게 표시할 내용)
 */
export interface PermissionRequest {
  toolId: string;
  toolName: string;
  description: string;
  details?: string;
  riskLevel: 'low' | 'medium' | 'high';
}

/**
 * 권한 응답
 */
export interface PermissionResponse {
  toolId: string;
  approved: boolean;
  remember?: boolean;  // 이 세션 동안 같은 도구 자동 승인
}

/**
 * 권한 요청 콜백 함수 타입
 */
export type PermissionCallback = (request: PermissionRequest) => Promise<PermissionResponse>;

/**
 * 도구별 위험도 매핑
 */
export const TOOL_RISK_LEVELS: Record<string, 'low' | 'medium' | 'high'> = {
  // 읽기 전용 (낮음)
  'View': 'low',
  'Read': 'low',
  'GlobTool': 'low',
  'GrepTool': 'low',
  'LS': 'low',
  'Glob': 'low',
  'Grep': 'low',
  'ReadNotebook': 'low',

  // 쓰기 작업 (중간)
  'Edit': 'medium',
  'Write': 'medium',
  'NotebookEdit': 'medium',
  'MultiEdit': 'medium',

  // 시스템 명령 (높음)
  'Bash': 'high',
  'Terminal': 'high',
  'Execute': 'high',
};

/**
 * 도구 설명 매핑
 */
export const TOOL_DESCRIPTIONS: Record<string, string> = {
  'View': '파일 내용 읽기',
  'Read': '파일 내용 읽기',
  'GlobTool': '파일 패턴 검색',
  'GrepTool': '텍스트 검색',
  'Glob': '파일 패턴 검색',
  'Grep': '텍스트 검색',
  'LS': '디렉토리 목록 조회',
  'ReadNotebook': '노트북 파일 읽기',
  'Edit': '파일 수정',
  'Write': '파일 생성/덮어쓰기',
  'NotebookEdit': '노트북 파일 수정',
  'MultiEdit': '여러 파일 수정',
  'Bash': '터미널 명령 실행',
  'Terminal': '터미널 명령 실행',
  'Execute': '명령 실행',
};
