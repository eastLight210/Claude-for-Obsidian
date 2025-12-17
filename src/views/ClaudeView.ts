import { ItemView, WorkspaceLeaf, MarkdownRenderer, Notice, setIcon } from 'obsidian';
import type ClaudePlugin from '../main';
import { ChatMessage, ClaudeStatusInfo, ContextType, UI_LIMITS } from '../types';

export const VIEW_TYPE_CLAUDE = 'claude-view';

export class ClaudeView extends ItemView {
  private plugin: ClaudePlugin;
  private messages: ChatMessage[] = [];
  private isLoading: boolean = false;
  private includeDocument: boolean = true;
  private includeSelection: boolean = false;
  private pendingSelectionContext: string | null = null;
  private cliStatus: ClaudeStatusInfo = { status: 'ready' };

  // UI 요소
  private containerEl!: HTMLElement;
  private messagesContainer!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  private sendButton!: HTMLButtonElement;
  private documentToggle!: HTMLButtonElement;
  private selectionToggle!: HTMLButtonElement;
  private statusIndicator!: HTMLElement;
  private currentLoadingEl: HTMLElement | null = null;
  private loadingStartTime: number = 0;
  private isComposing: boolean = false;
  private lastUserRequest: { message: string; context?: string; contextType: ContextType; fileName?: string } | null = null;
  private displayedDeniedTools: Set<string> = new Set();

  constructor(leaf: WorkspaceLeaf, plugin: ClaudePlugin) {
    super(leaf);
    this.plugin = plugin;
    this.includeDocument = plugin.settings.includeCurrentNote;
  }

  getViewType(): string {
    return VIEW_TYPE_CLAUDE;
  }

  getDisplayText(): string {
    return 'Claude';
  }

  getIcon(): string {
    return 'message-square';
  }

  async onOpen() {
    this.containerEl = this.contentEl;
    this.containerEl.empty();
    this.containerEl.addClass('claude-view-container');

    // 전체 레이아웃 구성
    this.buildHeader();
    this.buildMessagesArea();
    this.buildInputArea();

    // CLI 상태 확인
    await this.checkClaudeStatus();

    // 빈 상태 메시지 표시
    if (this.messages.length === 0) {
      this.showEmptyState();
    }
  }

  async onClose() {
    // 진행 중인 요청 중단
    this.plugin.claudeService?.abort();
  }

  /**
   * 선택 텍스트 컨텍스트 설정 (외부에서 호출)
   */
  setSelectionContext(selection: string) {
    this.pendingSelectionContext = selection;
    this.includeSelection = true;
    this.updateContextToggles();
    this.inputEl.focus();
  }

  /**
   * 헤더 영역 빌드
   */
  private buildHeader() {
    const header = this.containerEl.createDiv({ cls: 'claude-header' });

    const titleWrapper = header.createDiv({ cls: 'claude-header-title-wrapper' });
    titleWrapper.createSpan({ text: 'Claude', cls: 'claude-header-title' });

    this.statusIndicator = titleWrapper.createSpan({ cls: 'claude-status-indicator' });

    const headerActions = header.createDiv({ cls: 'claude-header-actions' });

    // 새 대화 버튼
    const newChatBtn = headerActions.createEl('button', { cls: 'claude-header-button' });
    setIcon(newChatBtn, 'refresh-cw');
    newChatBtn.setAttribute('aria-label', 'New conversation');
    newChatBtn.onclick = () => this.clearHistory();

    // 설정 버튼
    const settingsBtn = headerActions.createEl('button', { cls: 'claude-header-button' });
    setIcon(settingsBtn, 'settings');
    settingsBtn.setAttribute('aria-label', 'Settings');
    settingsBtn.onclick = () => {
      (this.app as any).setting.open();
      (this.app as any).setting.openTabById('claude-for-obsidian');
    };
  }

  /**
   * 메시지 영역 빌드
   */
  private buildMessagesArea() {
    this.messagesContainer = this.containerEl.createDiv({ cls: 'claude-messages-container' });
  }

  /**
   * 입력 영역 빌드
   */
  private buildInputArea() {
    const inputContainer = this.containerEl.createDiv({ cls: 'claude-input-container' });

    // 컨텍스트 옵션
    const contextOptions = inputContainer.createDiv({ cls: 'claude-context-options' });

    this.documentToggle = contextOptions.createEl('button', {
      cls: 'claude-context-toggle',
      text: '📄 Current document',
    });
    if (this.includeDocument) {
      this.documentToggle.addClass('active');
    }
    this.documentToggle.onclick = () => this.toggleDocumentContext();

    this.selectionToggle = contextOptions.createEl('button', {
      cls: 'claude-context-toggle',
      text: '🔍 Selection',
    });
    this.selectionToggle.onclick = () => this.toggleSelectionContext();

    // 입력 래퍼
    const inputWrapper = inputContainer.createDiv({ cls: 'claude-input-wrapper' });

    this.inputEl = inputWrapper.createEl('textarea', {
      cls: 'claude-input',
      attr: {
        placeholder: 'Ask Claude anything...',
        rows: '1',
      },
    });

    this.inputEl.addEventListener('input', () => {
      this.inputEl.style.height = 'auto';
      this.inputEl.style.height = Math.min(this.inputEl.scrollHeight, UI_LIMITS.TEXTAREA_MAX_HEIGHT) + 'px';
    });

    this.inputEl.addEventListener('compositionstart', () => {
      this.isComposing = true;
    });

    this.inputEl.addEventListener('compositionend', () => {
      this.isComposing = false;
    });

    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !this.isComposing) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    this.sendButton = inputWrapper.createEl('button', {
      cls: 'claude-send-button',
      text: 'Send',
    });
    this.sendButton.onclick = () => {
      if (this.isLoading) {
        this.abortRequest();
      } else {
        this.sendMessage();
      }
    };

    inputContainer.createDiv({
      cls: 'claude-input-hint',
      text: 'Enter to send · Shift+Enter for new line',
    });
  }

  private abortRequest() {
    this.plugin.claudeService?.abort();
    this.setLoading(false);
    new Notice('Request cancelled');
  }

  /**
   * 빈 상태 메시지 표시
   */
  private showEmptyState() {
    const emptyState = this.messagesContainer.createDiv({ cls: 'claude-empty-state' });
    emptyState.createDiv({ cls: 'claude-empty-state-icon', text: '💬' });
    emptyState.createDiv({
      cls: 'claude-empty-state-text',
      text: 'Start a conversation with Claude. You can include the current document or selection as context.',
    });
  }

  /**
   * 빈 상태 메시지 제거
   */
  private hideEmptyState() {
    const emptyState = this.messagesContainer.querySelector('.claude-empty-state');
    if (emptyState) {
      emptyState.remove();
    }
  }

  /**
   * CLI 상태 확인 및 표시
   */
  private async checkClaudeStatus() {
    if (this.plugin.claudeService) {
      this.cliStatus = await this.plugin.claudeService.checkAvailability();
      this.updateStatusIndicator();

      if (this.cliStatus.status !== 'ready') {
        this.showStatusMessage();
      }
    }
  }

  /**
   * 상태 인디케이터 업데이트
   */
  private updateStatusIndicator() {
    this.statusIndicator.removeClass('claude-status-ready', 'claude-status-error');

    if (this.cliStatus.status === 'ready') {
      this.statusIndicator.addClass('claude-status-ready');
      this.statusIndicator.setAttribute('aria-label', 'Claude CLI ready');
    } else {
      this.statusIndicator.addClass('claude-status-error');
      this.statusIndicator.setAttribute('aria-label', this.cliStatus.message || 'Claude CLI error');
    }
  }

  /**
   * 상태 메시지 표시
   */
  private showStatusMessage() {
    const statusMsg = this.messagesContainer.createDiv({ cls: 'claude-error' });

    if (this.cliStatus.status === 'not_installed') {
      statusMsg.innerHTML = `
        <strong>Claude CLI not installed</strong><br>
        Please install Claude CLI from <a href="https://claude.ai/download">claude.ai/download</a>
      `;
    } else if (this.cliStatus.status === 'not_authenticated') {
      statusMsg.innerHTML = `
        <strong>Not authenticated</strong><br>
        Please run <code>claude login</code> in your terminal to authenticate.
      `;
    } else {
      statusMsg.textContent = this.cliStatus.message || 'Unknown error';
    }
  }

  /**
   * 문서 컨텍스트 토글
   */
  private toggleDocumentContext() {
    this.includeDocument = !this.includeDocument;
    this.updateContextToggles();
  }

  /**
   * 선택 컨텍스트 토글
   */
  private toggleSelectionContext() {
    this.includeSelection = !this.includeSelection;
    if (this.includeSelection) {
      // 현재 선택 텍스트 가져오기
      const editor = this.app.workspace.activeEditor?.editor;
      if (editor) {
        const selection = editor.getSelection();
        if (selection) {
          this.pendingSelectionContext = selection;
        } else {
          new Notice('No text selected');
          this.includeSelection = false;
        }
      }
    } else {
      this.pendingSelectionContext = null;
    }
    this.updateContextToggles();
  }

  /**
   * 컨텍스트 토글 UI 업데이트
   */
  private updateContextToggles() {
    this.documentToggle.toggleClass('active', this.includeDocument);
    this.selectionToggle.toggleClass('active', this.includeSelection);
  }

  /**
   * 메시지 전송
   */
  private async sendMessage() {
    const message = this.inputEl.value.trim();
    if (!message || this.isLoading) return;

    // 즉시 로딩 상태로 설정 (중복 호출 방지)
    this.isLoading = true;
    this.sendButton.disabled = true;

    // CLI 상태 확인
    if (this.cliStatus.status !== 'ready') {
      new Notice('Claude CLI is not ready. Please check the status.');
      this.setLoading(false);
      return;
    }

    this.hideEmptyState();

    // 컨텍스트 수집
    let context: string | undefined;
    let contextType: ContextType = 'none';
    let fileName: string | undefined;

    if (this.includeSelection && this.pendingSelectionContext) {
      context = this.pendingSelectionContext;
      contextType = 'selection';
    } else if (this.includeDocument) {
      const activeFile = this.app.workspace.getActiveFile();
      if (activeFile) {
        context = await this.app.vault.read(activeFile);
        contextType = 'document';
        fileName = activeFile.name;
      }
    }

    if (context && context.length > this.plugin.settings.maxContextLength) {
      context = context.substring(0, this.plugin.settings.maxContextLength);
      new Notice('Context was truncated due to length limit');
    }

    this.lastUserRequest = { message, context, contextType, fileName };
    this.displayedDeniedTools.clear();

    const userMessage: ChatMessage = {
      id: this.generateId(),
      role: 'user',
      content: message,
      timestamp: Date.now(),
    };
    this.addMessage(userMessage);

    requestAnimationFrame(() => {
      this.inputEl.value = '';
      this.inputEl.style.height = 'auto';
    });
    this.pendingSelectionContext = null;
    this.includeSelection = false;
    this.updateContextToggles();

    // 로딩 상태
    this.setLoading(true);

    // Claude 응답 메시지 생성 (스트리밍용)
    const assistantMessage: ChatMessage = {
      id: this.generateId(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    };
    this.addMessage(assistantMessage);

    // Claude 호출
    const response = await this.plugin.claudeService?.sendMessage(
      { message, context, contextType, fileName },
      (chunk) => {
        assistantMessage.content += chunk;
        this.updateMessageContent(assistantMessage.id, assistantMessage.content);
      },
      undefined, // deprecated permission request callback
      // 도구 사용 상태 콜백
      (toolName: string, status: 'pending' | 'approved' | 'denied') => {
        this.showToolUseStatus(assistantMessage.id, toolName, status);
      },
      // 권한 거부 콜백
      (denials) => {
        this.handlePermissionDenials(assistantMessage.id, denials);
      }
    );

    assistantMessage.isStreaming = false;
    assistantMessage.responseTimeMs = Date.now() - this.loadingStartTime;

    if (response && !response.success) {
      this.updateMessageContent(
        assistantMessage.id,
        `**Error:** ${response.error}`,
        true
      );
    } else {
      this.showResponseTime(assistantMessage.id, assistantMessage.responseTimeMs);
    }

    this.setLoading(false);

    // 자동 복사
    if (this.plugin.settings.autoCopyResponse && response?.success && response.content) {
      await navigator.clipboard.writeText(response.content);
      new Notice('Response copied to clipboard');
    }

    // 히스토리 제한 적용
    this.enforceHistoryLimit();
  }

  /**
   * 메시지 추가
   */
  private addMessage(message: ChatMessage) {
    this.messages.push(message);
    this.renderMessage(message);
    this.scrollToBottom();
  }

  private renderMessage(message: ChatMessage) {
    const msgEl = this.messagesContainer.createDiv({
      cls: `claude-message claude-message-${message.role}`,
      attr: { 'data-id': message.id },
    });

    msgEl.createDiv({
      cls: 'claude-message-role',
      text: message.role === 'user' ? 'You' : 'Claude',
    });

    const contentEl = msgEl.createDiv({ cls: 'claude-message-content' });

    if (message.role === 'assistant') {
      if (message.isStreaming && !message.content) {
        this.renderLoadingIndicator(contentEl);
      } else {
        MarkdownRenderer.render(
          this.app,
          message.content || '',
          contentEl,
          '',
          this
        );
      }

      if (!message.isStreaming && message.content) {
        this.renderActionButtons(msgEl, message);
      }
    } else {
      contentEl.textContent = message.content;
    }
  }

  private renderLoadingIndicator(container: HTMLElement) {
    this.loadingStartTime = Date.now();
    const loadingEl = container.createDiv({ cls: 'claude-loading' });
    this.currentLoadingEl = loadingEl;

    loadingEl.createDiv({ cls: 'claude-loading-spinner' });
    loadingEl.createSpan({ cls: 'claude-loading-text', text: 'Claude is thinking...' });

    const statusEl = loadingEl.createDiv({ cls: 'claude-loading-status' });
    statusEl.createDiv({ cls: 'claude-loading-pulse' });
  }

  updateLoadingStatus(status: string) {
    if (this.currentLoadingEl) {
      const textEl = this.currentLoadingEl.querySelector('.claude-loading-text');
      if (textEl) {
        textEl.textContent = status;
      }
    }
  }

  private removeLoadingIndicator() {
    if (this.currentLoadingEl) {
      this.currentLoadingEl.remove();
      this.currentLoadingEl = null;
    }
  }

  private showResponseTime(messageId: string, timeMs: number) {
    const msgEl = this.messagesContainer.querySelector(`[data-id="${messageId}"]`);
    if (!msgEl) return;

    const roleEl = msgEl.querySelector('.claude-message-role');
    if (!roleEl) return;

    const seconds = (timeMs / 1000).toFixed(1);
    const timeEl = roleEl.createSpan({ cls: 'claude-response-time' });
    timeEl.textContent = ` · ${seconds}s`;
  }

  /**
   * 액션 버튼 렌더링
   */
  private renderActionButtons(msgEl: HTMLElement, message: ChatMessage) {
    const actionsEl = msgEl.createDiv({ cls: 'claude-message-actions' });

    // 문서에 삽입
    const insertBtn = actionsEl.createEl('button', {
      cls: 'claude-action-button',
      text: 'Insert to document',
    });
    insertBtn.onclick = () => this.insertToDocument(message.content);

    // 복사
    const copyBtn = actionsEl.createEl('button', {
      cls: 'claude-action-button',
      text: 'Copy',
    });
    copyBtn.onclick = () => this.copyToClipboard(message.content);

    // 새 노트로 저장
    const saveBtn = actionsEl.createEl('button', {
      cls: 'claude-action-button',
      text: 'Save as note',
    });
    saveBtn.onclick = () => this.saveAsNote(message.content);
  }

  private updateMessageContent(messageId: string, content: string, isError: boolean = false) {
    const msgEl = this.messagesContainer.querySelector(`[data-id="${messageId}"]`);
    if (msgEl) {
      const contentEl = msgEl.querySelector('.claude-message-content');
      if (contentEl) {
        this.removeLoadingIndicator();
        contentEl.empty();

        if (isError) {
          contentEl.addClass('claude-error');
        }

        MarkdownRenderer.render(
          this.app,
          content,
          contentEl as HTMLElement,
          '',
          this
        );
      }

      const message = this.messages.find((m) => m.id === messageId);
      if (message && !message.isStreaming && !isError) {
        const existingActions = msgEl.querySelector('.claude-message-actions');
        if (!existingActions) {
          this.renderActionButtons(msgEl as HTMLElement, message);
        }
      }
    }
    this.scrollToBottom();
  }

  /**
   * 문서에 삽입
   */
  private insertToDocument(content: string) {
    const editor = this.app.workspace.activeEditor?.editor;
    if (editor) {
      editor.replaceSelection(content);
      new Notice('Inserted to document');
    } else {
      new Notice('No active editor');
    }
  }

  /**
   * 클립보드에 복사
   */
  private async copyToClipboard(content: string) {
    await navigator.clipboard.writeText(content);
    new Notice('Copied to clipboard');
  }

  /**
   * 새 노트로 저장
   */
  private async saveAsNote(content: string) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `Claude Response ${timestamp}.md`;

    try {
      await this.app.vault.create(fileName, content);
      new Notice(`Saved as ${fileName}`);
    } catch (error) {
      new Notice('Failed to save note');
    }
  }

  /**
   * 히스토리 초기화 (새 대화 시작)
   */
  private clearHistory() {
    this.messages = [];
    this.messagesContainer.empty();
    this.showEmptyState();

    // 세션 초기화 (컨텍스트 리셋)
    this.plugin.claudeService?.clearSession();

    new Notice('Conversation cleared');
  }

  /**
   * 히스토리 제한 적용
   */
  private enforceHistoryLimit() {
    const limit = this.plugin.settings.historyLimit;
    if (this.messages.length > limit) {
      const toRemove = this.messages.length - limit;
      const removedIds = this.messages.splice(0, toRemove).map((m) => m.id);

      // DOM에서도 제거
      removedIds.forEach((id) => {
        const el = this.messagesContainer.querySelector(`[data-id="${id}"]`);
        if (el) el.remove();
      });
    }
  }

  private setLoading(loading: boolean) {
    this.isLoading = loading;
    if (loading) {
      this.sendButton.textContent = 'Stop';
      this.sendButton.addClass('claude-send-button-stop');
      this.sendButton.disabled = false;
    } else {
      this.sendButton.textContent = 'Send';
      this.sendButton.removeClass('claude-send-button-stop');
      this.sendButton.disabled = false;
      this.removeLoadingIndicator();
    }
  }

  /**
   * 스크롤 맨 아래로
   */
  private scrollToBottom() {
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  /**
   * 고유 ID 생성
   */
  private generateId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private handlePermissionDenials(
    messageId: string,
    denials: Array<{ toolName: string; toolInput: Record<string, unknown> }>
  ) {
    const uniqueDenials = denials.filter(d => {
      if (this.displayedDeniedTools.has(d.toolName)) return false;
      this.displayedDeniedTools.add(d.toolName);
      return true;
    });

    if (uniqueDenials.length === 0) return;

    const msgEl = this.messagesContainer.querySelector(`[data-id="${messageId}"]`);
    if (!msgEl) return;

    const contentEl = msgEl.querySelector('.claude-message-content');
    if (!contentEl) return;

    let denialsContainer = contentEl.querySelector('.claude-permission-denials');
    if (!denialsContainer) {
      denialsContainer = (contentEl as HTMLElement).createDiv({ cls: 'claude-permission-denials' });
    }

    const header = denialsContainer.querySelector('.claude-denials-header') ||
      (denialsContainer as HTMLElement).createDiv({ cls: 'claude-denials-header' });
    header.empty();
    header.createSpan({ text: '⚠️ 다음 도구가 권한 없이 실행되지 못했습니다:' });

    for (const denial of uniqueDenials) {
      const existingEl = denialsContainer.querySelector(`[data-tool-denial="${denial.toolName}"]`);
      if (existingEl) continue;

      const denialEl = (denialsContainer as HTMLElement).createDiv({
        cls: 'claude-denial-item',
        attr: { 'data-tool-denial': denial.toolName },
      });

      denialEl.createSpan({
        cls: 'claude-denial-tool-name',
        text: denial.toolName,
      });

      const allowBtn = denialEl.createEl('button', {
        cls: 'claude-denial-allow-btn',
        text: '허용',
      });
      allowBtn.onclick = () => {
        this.plugin.claudeService?.allowTool(denial.toolName);
        allowBtn.textContent = '허용됨 ✓';
        allowBtn.disabled = true;
        allowBtn.addClass('allowed');
      };
    }

    let retryContainer = denialsContainer.querySelector('.claude-retry-container');
    if (!retryContainer) {
      retryContainer = (denialsContainer as HTMLElement).createDiv({ cls: 'claude-retry-container' });

      const retryBtn = (retryContainer as HTMLElement).createEl('button', {
        cls: 'claude-retry-btn',
        text: '모두 허용하고 재시도',
      });
      retryBtn.onclick = () => this.allowAllAndRetry(denials);
    }

    this.scrollToBottom();
  }

  private async allowAllAndRetry(denials: Array<{ toolName: string; toolInput: Record<string, unknown> }>) {
    for (const denial of denials) {
      this.plugin.claudeService?.allowTool(denial.toolName);
    }

    const allAllowBtns = this.messagesContainer.querySelectorAll('.claude-denial-allow-btn:not(.allowed)');
    allAllowBtns.forEach((btn) => {
      (btn as HTMLButtonElement).textContent = '허용됨 ✓';
      (btn as HTMLButtonElement).disabled = true;
      btn.addClass('allowed');
    });

    const allRetryBtns = this.messagesContainer.querySelectorAll('.claude-retry-btn');
    allRetryBtns.forEach((btn) => {
      (btn as HTMLButtonElement).disabled = true;
      (btn as HTMLButtonElement).textContent = '재시도 중...';
    });

    if (!this.lastUserRequest) {
      new Notice('재시도할 요청이 없습니다.');
      return;
    }

    await this.retryLastRequest();
  }

  private async retryLastRequest() {
    if (!this.lastUserRequest || this.isLoading) return;

    const { message, context, contextType, fileName } = this.lastUserRequest;

    this.displayedDeniedTools.clear();
    this.setLoading(true);
    const retryStartTime = Date.now();

    const assistantMessage: ChatMessage = {
      id: this.generateId(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    };
    this.addMessage(assistantMessage);

    const response = await this.plugin.claudeService?.sendMessage(
      { message, context, contextType, fileName },
      (chunk) => {
        assistantMessage.content += chunk;
        this.updateMessageContent(assistantMessage.id, assistantMessage.content);
      },
      undefined,
      (toolName: string, status: 'pending' | 'approved' | 'denied') => {
        this.showToolUseStatus(assistantMessage.id, toolName, status);
      },
      (newDenials) => {
        this.handlePermissionDenials(assistantMessage.id, newDenials);
      }
    );

    assistantMessage.isStreaming = false;
    assistantMessage.responseTimeMs = Date.now() - retryStartTime;

    if (response && !response.success) {
      this.updateMessageContent(assistantMessage.id, `**Error:** ${response.error}`, true);
    } else {
      this.showResponseTime(assistantMessage.id, assistantMessage.responseTimeMs);
    }

    this.setLoading(false);
    this.enforceHistoryLimit();
  }

  private showToolUseStatus(
    messageId: string,
    toolName: string,
    status: 'pending' | 'approved' | 'denied'
  ) {
    if (status === 'pending' || status === 'approved') {
      this.updateLoadingStatus(`Using ${toolName}...`);
    }

    const msgEl = this.messagesContainer.querySelector(`[data-id="${messageId}"]`);
    if (!msgEl) return;

    let toolStatusContainer = msgEl.querySelector('.claude-tool-status-container');
    if (!toolStatusContainer) {
      const contentEl = msgEl.querySelector('.claude-message-content');
      if (contentEl) {
        toolStatusContainer = contentEl.createDiv({ cls: 'claude-tool-status-container' });
      }
    }

    if (!toolStatusContainer) return;

    let toolEl = toolStatusContainer.querySelector(`[data-tool="${toolName}"]`) as HTMLElement;
    if (!toolEl) {
      toolEl = (toolStatusContainer as HTMLElement).createDiv({
        cls: 'claude-tool-use',
        attr: { 'data-tool': toolName },
      });

      const iconEl = toolEl.createSpan({ cls: 'claude-tool-use-icon' });
      setIcon(iconEl, 'terminal');

      toolEl.createSpan({
        cls: 'claude-tool-use-name',
        text: toolName,
      });

      toolEl.createSpan({ cls: 'claude-tool-use-status' });
    }

    const statusEl = toolEl.querySelector('.claude-tool-use-status');
    if (statusEl) {
      statusEl.removeClass(
        'claude-tool-use-status-pending',
        'claude-tool-use-status-approved',
        'claude-tool-use-status-denied'
      );

      switch (status) {
        case 'pending':
          statusEl.addClass('claude-tool-use-status-pending');
          statusEl.textContent = '대기 중...';
          break;
        case 'approved':
          statusEl.addClass('claude-tool-use-status-approved');
          statusEl.textContent = '승인됨';
          break;
        case 'denied':
          statusEl.addClass('claude-tool-use-status-denied');
          statusEl.textContent = '거부됨';
          break;
      }
    }

    this.scrollToBottom();
  }
}
