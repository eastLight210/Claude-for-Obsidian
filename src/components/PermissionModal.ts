import { App, Modal, setIcon } from 'obsidian';
import {
  PermissionRequest,
  PermissionResponse,
  TOOL_RISK_LEVELS,
  TOOL_DESCRIPTIONS,
} from '../types';

/**
 * 도구 사용 권한 요청 모달
 */
export class PermissionModal extends Modal {
  private request: PermissionRequest;
  private resolvePromise: ((response: PermissionResponse) => void) | null = null;
  private showRememberOption: boolean;

  constructor(app: App, request: PermissionRequest, showRememberOption: boolean = true) {
    super(app);
    this.request = request;
    this.showRememberOption = showRememberOption;
  }

  /**
   * 모달을 열고 사용자 응답을 Promise로 반환
   */
  async prompt(): Promise<PermissionResponse> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.open();
    });
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('claude-permission-modal');

    // 헤더
    const header = contentEl.createDiv({ cls: 'claude-permission-header' });
    const iconEl = header.createSpan({ cls: 'claude-permission-icon' });
    this.setRiskIcon(iconEl, this.request.riskLevel);
    header.createSpan({
      text: '도구 사용 권한 요청',
      cls: 'claude-permission-title',
    });

    // 도구 정보
    const infoEl = contentEl.createDiv({ cls: 'claude-permission-info' });

    const toolNameEl = infoEl.createDiv({ cls: 'claude-permission-tool-name' });
    toolNameEl.createSpan({ text: '도구: ' });
    toolNameEl.createSpan({
      text: this.request.toolName,
      cls: 'claude-permission-tool-badge',
    });

    infoEl.createDiv({
      text: this.request.description,
      cls: 'claude-permission-description',
    });

    // 상세 정보 (있는 경우)
    if (this.request.details) {
      const detailsEl = infoEl.createDiv({ cls: 'claude-permission-details' });
      detailsEl.createEl('pre', { text: this.request.details });
    }

    // 위험도 표시
    const riskEl = contentEl.createDiv({ cls: 'claude-permission-risk' });
    riskEl.createSpan({ text: '위험도: ' });
    const riskBadge = riskEl.createSpan({
      text: this.getRiskLabel(this.request.riskLevel),
      cls: `claude-permission-risk-badge claude-permission-risk-${this.request.riskLevel}`,
    });

    // 기억하기 옵션
    let rememberCheckbox: HTMLInputElement | null = null;
    if (this.showRememberOption) {
      const rememberEl = contentEl.createDiv({ cls: 'claude-permission-remember' });
      rememberCheckbox = rememberEl.createEl('input', {
        type: 'checkbox',
        attr: { id: 'remember-permission' },
      });
      rememberEl.createEl('label', {
        text: '이 세션 동안 이 도구 자동 승인',
        attr: { for: 'remember-permission' },
      });
    }

    // 버튼
    const buttonsEl = contentEl.createDiv({ cls: 'claude-permission-buttons' });

    const denyBtn = buttonsEl.createEl('button', {
      text: '거부',
      cls: 'claude-permission-btn claude-permission-btn-deny',
    });
    denyBtn.onclick = () => {
      this.respond(false, rememberCheckbox?.checked || false);
    };

    const allowBtn = buttonsEl.createEl('button', {
      text: '허용',
      cls: 'claude-permission-btn claude-permission-btn-allow',
    });
    allowBtn.onclick = () => {
      this.respond(true, rememberCheckbox?.checked || false);
    };

    // 포커스
    allowBtn.focus();
  }

  onClose() {
    // 모달이 닫힐 때 응답하지 않았으면 거부로 처리
    if (this.resolvePromise) {
      this.resolvePromise({
        toolId: this.request.toolId,
        approved: false,
      });
      this.resolvePromise = null;
    }
  }

  private respond(approved: boolean, remember: boolean) {
    if (this.resolvePromise) {
      this.resolvePromise({
        toolId: this.request.toolId,
        approved,
        remember,
      });
      this.resolvePromise = null;
    }
    this.close();
  }

  private setRiskIcon(el: HTMLElement, riskLevel: 'low' | 'medium' | 'high') {
    switch (riskLevel) {
      case 'low':
        setIcon(el, 'info');
        el.addClass('claude-permission-icon-low');
        break;
      case 'medium':
        setIcon(el, 'alert-triangle');
        el.addClass('claude-permission-icon-medium');
        break;
      case 'high':
        setIcon(el, 'alert-octagon');
        el.addClass('claude-permission-icon-high');
        break;
    }
  }

  private getRiskLabel(riskLevel: 'low' | 'medium' | 'high'): string {
    switch (riskLevel) {
      case 'low':
        return '낮음';
      case 'medium':
        return '중간';
      case 'high':
        return '높음';
    }
  }
}

/**
 * PermissionRequest 생성 헬퍼
 */
export function createPermissionRequest(
  toolId: string,
  toolName: string,
  input: Record<string, unknown>
): PermissionRequest {
  const riskLevel = TOOL_RISK_LEVELS[toolName] || 'medium';
  const description = TOOL_DESCRIPTIONS[toolName] || `${toolName} 도구 실행`;

  // 상세 정보 생성
  let details: string | undefined;
  if (input) {
    if (toolName === 'Edit' || toolName === 'Write') {
      details = `파일: ${input.file_path || input.path || 'unknown'}`;
      if (input.content) {
        const content = String(input.content);
        details += `\n내용 (${content.length}자):\n${content.substring(0, 500)}${content.length > 500 ? '...' : ''}`;
      }
    } else if (toolName === 'Bash' || toolName === 'Terminal' || toolName === 'Execute') {
      details = `명령어: ${input.command || input.cmd || JSON.stringify(input)}`;
    } else if (toolName === 'Read' || toolName === 'View') {
      details = `파일: ${input.file_path || input.path || JSON.stringify(input)}`;
    } else {
      details = JSON.stringify(input, null, 2);
    }
  }

  return {
    toolId,
    toolName,
    description,
    details,
    riskLevel,
  };
}
