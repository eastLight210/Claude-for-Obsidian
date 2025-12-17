import { spawn, ChildProcess } from 'child_process';
import { existsSync, realpathSync } from 'fs';
import { StringDecoder } from 'string_decoder';
import {
  ClaudeStatusInfo,
  SendMessageOptions,
  StreamCallback,
  ClaudeResponse,
  TIMEOUTS,
} from '../types';

/**
 * Stream JSON 이벤트 타입
 */
interface StreamEvent {
  type: 'system' | 'assistant' | 'user' | 'result';
  subtype?: string;
  message?: {
    id?: string;
    content?: Array<{
      type: 'text' | 'tool_use' | 'tool_result';
      text?: string;
      id?: string;
      name?: string;
      input?: Record<string, unknown>;
      tool_use_id?: string;
      content?: string;
    }>;
  };
  session_id?: string;
  is_error?: boolean;
  error?: string;
  permission_denials?: Array<{
    tool_name: string;
    tool_use_id: string;
    tool_input: Record<string, unknown>;
  }>;
}

export class ClaudeService {
  private claudePath: string;
  private currentProcess: ChildProcess | null = null;
  private isAborted: boolean = false;

  // 세션 ID (대화 컨텍스트 유지용)
  private sessionId: string | null = null;

  // 허용된 도구 목록 (--allowedTools로 전달)
  private allowedTools: Set<string> = new Set();

  // 설정
  private autoApproveReadOnly: boolean = true;
  private rememberApprovedTools: boolean = true;
  private systemPrompt: string = '';

  // 현재 메시지 처리 상태
  private currentResolve: ((response: ClaudeResponse) => void) | null = null;
  private currentOnChunk: StreamCallback | null = null;
  private currentOnToolUse: ((toolName: string, status: 'pending' | 'approved' | 'denied') => void) | null = null;
  private onPermissionDenied: ((denials: Array<{ toolName: string; toolInput: Record<string, unknown> }>) => void) | null = null;

  // 응답 버퍼
  private fullResponse: string = '';
  private lineBuffer: string = '';
  private decoder: StringDecoder = new StringDecoder('utf-8');
  private processedTexts: Set<string> = new Set();
  private processedToolIds: Set<string> = new Set();
  private processedMessageUuids: Set<string> = new Set();
  private lastEventType: string | null = null;
  private lastPermissionDenials: Array<{ toolName: string; toolInput: Record<string, unknown> }> = [];

  // GUI 앱에서 PATH에 포함되지 않을 수 있는 일반적인 CLI 설치 경로들
  private static readonly COMMON_PATHS = [
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/home/linuxbrew/.linuxbrew/bin',
    `${process.env.HOME}/.local/bin`,
    `${process.env.HOME}/.claude/local`,
  ];

  // 기본적으로 허용할 읽기 전용 도구들
  private static readonly DEFAULT_ALLOWED_TOOLS = [
    // 기본 읽기 도구
    'View', 'Read', 'Glob', 'Grep', 'LS',
    'GlobTool', 'GrepTool', 'ReadNotebook',
    // MCP Obsidian 읽기 도구
    'mcp__mcp-obsidian__obsidian_list_files_in_dir',
    'mcp__mcp-obsidian__obsidian_list_files_in_vault',
    'mcp__mcp-obsidian__obsidian_get_file_contents',
    'mcp__mcp-obsidian__obsidian_simple_search',
    'mcp__mcp-obsidian__obsidian_complex_search',
    'mcp__mcp-obsidian__obsidian_batch_get_file_contents',
    'mcp__mcp-obsidian__obsidian_get_periodic_note',
    'mcp__mcp-obsidian__obsidian_get_recent_periodic_notes',
    'mcp__mcp-obsidian__obsidian_get_recent_changes',
  ];

  constructor(claudePath: string = 'claude') {
    this.claudePath = claudePath;
    // 기본 허용 도구 설정
    ClaudeService.DEFAULT_ALLOWED_TOOLS.forEach(tool => this.allowedTools.add(tool));
  }

  /**
   * 확장된 PATH 환경변수 생성
   */
  private getExtendedEnv(): NodeJS.ProcessEnv {
    const currentPath = process.env.PATH || '';
    const additionalPaths = ClaudeService.COMMON_PATHS.filter(p => !currentPath.includes(p));
    const extendedPath = [...additionalPaths, currentPath].join(':');

    return {
      ...process.env,
      PATH: extendedPath,
      LANG: 'en_US.UTF-8',
      LC_ALL: 'en_US.UTF-8',
    };
  }

  /**
   * 설정 업데이트
   */
  updateSettings(settings: {
    claudePath?: string;
    autoApproveReadOnly?: boolean;
    rememberApprovedTools?: boolean;
    systemPrompt?: string;
  }) {
    if (settings.claudePath !== undefined) {
      this.claudePath = settings.claudePath;
    }
    if (settings.autoApproveReadOnly !== undefined) {
      this.autoApproveReadOnly = settings.autoApproveReadOnly;
    }
    if (settings.rememberApprovedTools !== undefined) {
      this.rememberApprovedTools = settings.rememberApprovedTools;
    }
    if (settings.systemPrompt !== undefined) {
      this.systemPrompt = settings.systemPrompt;
    }
  }

  /**
   * 도구 허용 추가
   */
  allowTool(toolName: string) {
    this.allowedTools.add(toolName);
  }

  /**
   * 도구 허용 제거
   */
  disallowTool(toolName: string) {
    this.allowedTools.delete(toolName);
  }

  /**
   * 허용된 도구 목록 반환
   */
  getAllowedTools(): string[] {
    return Array.from(this.allowedTools);
  }

  /**
   * 허용된 도구 목록 초기화 (기본값으로)
   */
  resetAllowedTools() {
    this.allowedTools.clear();
    ClaudeService.DEFAULT_ALLOWED_TOOLS.forEach(tool => this.allowedTools.add(tool));
  }

  /**
   * 세션 초기화 (새 대화 시작)
   */
  clearSession() {
    this.sessionId = null;
    this.resetAllowedTools();
    this.terminateProcess();
  }

  /**
   * 현재 세션 ID 반환
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * 마지막 권한 거부 목록 반환
   */
  getLastPermissionDenials() {
    return this.lastPermissionDenials;
  }

  /**
   * Claude CLI 전체 경로 찾기
   */
  private findClaudePath(): string {
    if (this.claudePath.startsWith('/') && existsSync(this.claudePath)) {
      return this.claudePath;
    }

    for (const basePath of ClaudeService.COMMON_PATHS) {
      const fullPath = `${basePath}/claude`;
      if (existsSync(fullPath)) {
        try {
          return realpathSync(fullPath);
        } catch {
          return fullPath;
        }
      }
    }

    return this.claudePath;
  }

  /**
   * 프로세스 종료
   */
  private terminateProcess() {
    if (this.currentProcess) {
      this.currentProcess.kill('SIGTERM');
      this.currentProcess = null;
    }
    this.resetBuffers();
  }

  /**
   * 버퍼 초기화
   */
  private resetBuffers() {
    this.fullResponse = '';
    this.lineBuffer = '';
    this.decoder = new StringDecoder('utf-8');
    this.processedTexts.clear();
    this.processedToolIds.clear();
    this.processedMessageUuids.clear();
    this.lastEventType = null;
    this.lastPermissionDenials = [];
  }

  /**
   * stdout 데이터 처리
   */
  private handleStdout(data: Buffer) {
    if (this.isAborted) return;

    const text = this.decoder.write(data);
    this.lineBuffer += text;

    const lines = this.lineBuffer.split('\n');
    this.lineBuffer = lines.pop() || '';

    for (const line of lines) {
      this.processLine(line.trim());
    }
  }

  /**
   * JSON 라인 처리
   */
  private processLine(line: string) {
    if (!line) return;

    try {
      const event = JSON.parse(line) as StreamEvent;

      // UUID 기반 중복 체크
      if ((event as { uuid?: string }).uuid && this.processedMessageUuids.has((event as { uuid: string }).uuid)) {
        return;
      }
      if ((event as { uuid?: string }).uuid) {
        this.processedMessageUuids.add((event as { uuid: string }).uuid);
      }

      // 새 assistant 메시지 줄바꿈 처리
      const isNewAssistantMessage = event.type === 'assistant' && this.lastEventType !== 'assistant';
      let lineBreakAdded = false;

      this.handleStreamEvent(
        event,
        (text) => {
          if (isNewAssistantMessage && this.fullResponse.length > 0 && !lineBreakAdded) {
            this.fullResponse += '\n\n';
            this.currentOnChunk?.('\n\n');
            lineBreakAdded = true;
          }
          this.fullResponse += text;
          this.currentOnChunk?.(text);
        }
      );

      this.lastEventType = event.type;

      // result 이벤트면 현재 메시지 완료
      if (event.type === 'result') {
        // 권한 거부 목록 저장
        if (event.permission_denials && event.permission_denials.length > 0) {
          this.lastPermissionDenials = event.permission_denials.map(d => ({
            toolName: d.tool_name,
            toolInput: d.tool_input,
          }));
          this.onPermissionDenied?.(this.lastPermissionDenials);
        }

        if (this.currentResolve) {
          this.currentResolve({
            success: !event.is_error,
            content: this.fullResponse,
            error: event.error,
          });
          this.currentResolve = null;
        }
      }
    } catch {
      // JSON이 아닌 라인은 무시
      console.log('[ClaudeService] Non-JSON line:', line);
    }
  }

  /**
   * Claude CLI 설치/인증 상태 확인
   */
  async checkAvailability(): Promise<ClaudeStatusInfo> {
    return new Promise((resolve) => {
      try {
        const claudePath = this.findClaudePath();
        const proc = spawn(claudePath, ['--version'], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: this.getExtendedEnv(),
        });

        let stdout = '';
        let stderr = '';

        proc.stdout?.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        proc.stderr?.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        proc.on('error', (error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') {
            resolve({
              status: 'not_installed',
              message: 'Claude CLI is not installed.',
            });
          } else {
            resolve({ status: 'error', message: error.message });
          }
        });

        proc.on('close', (code: number) => {
          if (code === 0) {
            const versionMatch = stdout.match(/[\d.]+/);
            resolve({
              status: 'ready',
              version: versionMatch ? versionMatch[0] : undefined,
            });
          } else {
            resolve({
              status: 'error',
              message: stderr || 'Unknown error',
            });
          }
        });

        setTimeout(() => {
          proc.kill();
          resolve({ status: 'error', message: 'Timeout' });
        }, TIMEOUTS.VERSION_CHECK);
      } catch (error) {
        resolve({
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });
  }

  /**
   * Claude에게 메시지 전송 (-p 모드 사용)
   */
  async sendMessage(
    options: SendMessageOptions,
    onChunk: StreamCallback,
    _onPermissionRequest?: unknown, // deprecated - 사용하지 않음
    onToolUse?: (toolName: string, status: 'pending' | 'approved' | 'denied') => void,
    onPermissionDenied?: (denials: Array<{ toolName: string; toolInput: Record<string, unknown> }>) => void
  ): Promise<ClaudeResponse> {
    return new Promise((resolve) => {
      this.isAborted = false;
      this.currentResolve = resolve;
      this.currentOnChunk = onChunk;
      this.currentOnToolUse = onToolUse || null;
      this.onPermissionDenied = onPermissionDenied || null;
      this.resetBuffers();

      try {
        const claudePath = this.findClaudePath();

        // 프롬프트 구성
        let prompt = options.message;
        if (options.context && options.contextType !== 'none') {
          const contextLabel = options.fileName
            ? `Document: ${options.fileName}`
            : 'Context';
          prompt = `${contextLabel}\n\n${options.context}\n\n---\n\nUser Question: ${options.message}`;
        }

        // 인자 구성 (-p는 플래그, 프롬프트는 stdin으로 전달)
        const args = [
          '-p',
          '--output-format', 'stream-json',
          '--verbose',
        ];

        // 시스템 프롬프트 추가
        if (this.systemPrompt) {
          args.push('--append-system-prompt', this.systemPrompt);
        }

        // 기존 세션이 있으면 --resume 추가
        if (this.sessionId) {
          args.push('--resume', this.sessionId);
        }

        // 허용된 도구 목록 추가
        if (this.allowedTools.size > 0) {
          args.push('--allowedTools', Array.from(this.allowedTools).join(','));
        }

        console.log('[ClaudeService] Starting process with args:', args);
        console.log('[ClaudeService] Claude path:', claudePath);

        this.currentProcess = spawn(claudePath, args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: this.getExtendedEnv(),
        });

        // stdout 처리
        this.currentProcess.stdout?.on('data', (data: Buffer) => {
          this.handleStdout(data);
        });

        // stderr 처리
        this.currentProcess.stderr?.on('data', (data: Buffer) => {
          console.error('[ClaudeService] stderr:', data.toString('utf-8'));
        });

        // stdin으로 프롬프트 전송 후 닫기
        if (this.currentProcess.stdin) {
          this.currentProcess.stdin.write(prompt);
          this.currentProcess.stdin.end();
        }

        // 프로세스 종료 처리
        this.currentProcess.on('close', (code) => {
          console.log('[ClaudeService] Process exited with code:', code);
          this.currentProcess = null;

          // 아직 resolve되지 않았다면 처리
          if (this.currentResolve) {
            if (this.fullResponse) {
              this.currentResolve({ success: true, content: this.fullResponse });
            } else {
              this.currentResolve({ success: false, error: `Process exited with code ${code}` });
            }
            this.currentResolve = null;
          }
        });

        this.currentProcess.on('error', (error) => {
          console.error('[ClaudeService] Process error:', error);
          if (this.currentResolve) {
            this.currentResolve({ success: false, error: error.message });
            this.currentResolve = null;
          }
        });

        setTimeout(() => {
          if (this.currentResolve === resolve) {
            this.terminateProcess();
            resolve({
              success: false,
              error: 'Request timed out after 5 minutes',
            });
          }
        }, TIMEOUTS.MESSAGE);

      } catch (error) {
        resolve({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });
  }

  /**
   * Stream JSON 이벤트 처리
   */
  private handleStreamEvent(
    event: StreamEvent,
    onText: (text: string) => void,
  ): void {
    // session_id 저장
    if (event.session_id && !this.sessionId) {
      this.sessionId = event.session_id;
      console.log('[ClaudeService] Session ID saved:', this.sessionId);
    }

    if (event.type === 'system' && event.subtype === 'init') {
      console.log('[ClaudeService] Session initialized');
      console.log('[ClaudeService] Init event:', JSON.stringify(event, null, 2));
      return;
    }

    if (event.type === 'assistant' && event.message?.content) {
      for (const content of event.message.content) {
        if (content.type === 'text' && content.text) {
          if (!this.processedTexts.has(content.text)) {
            this.processedTexts.add(content.text);
            onText(content.text);
          }
        } else if (content.type === 'tool_use' && content.name && content.id) {
          const toolName = content.name;
          const toolId = content.id;

          if (this.processedToolIds.has(toolId)) {
            return;
          }
          this.processedToolIds.add(toolId);

          console.log('[ClaudeService] Tool use:', toolName, '| ID:', toolId);

          // 허용된 도구인지 확인
          const isAllowed = this.allowedTools.has(toolName);
          this.currentOnToolUse?.(toolName, isAllowed ? 'approved' : 'pending');
        }
      }
    }

    // user 타입의 tool_result 처리 (도구 실행 결과)
    if (event.type === 'user' && event.message?.content) {
      for (const content of event.message.content) {
        if (content.type === 'tool_result' && content.tool_use_id) {
          // 도구 실행 완료
          console.log('[ClaudeService] Tool result for:', content.tool_use_id);
        }
      }
    }
  }

  /**
   * 현재 실행 중단
   */
  abort() {
    this.isAborted = true;
    this.terminateProcess();
    if (this.currentResolve) {
      this.currentResolve({ success: false, error: 'Request was cancelled' });
      this.currentResolve = null;
    }
  }

  /**
   * 프로세스 실행 중 여부
   */
  isRunning(): boolean {
    return this.currentProcess !== null && !this.currentProcess.killed;
  }

  /**
   * 완전 종료 (Obsidian 종료 시 호출)
   */
  shutdown() {
    console.log('[ClaudeService] Shutting down...');
    this.terminateProcess();
    this.sessionId = null;
    this.allowedTools.clear();
  }
}
