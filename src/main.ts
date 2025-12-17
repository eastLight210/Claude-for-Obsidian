import { Plugin, WorkspaceLeaf } from 'obsidian';
import { ClaudePluginSettings, DEFAULT_SETTINGS } from './types';
import { ClaudeView, VIEW_TYPE_CLAUDE } from './views/ClaudeView';
import { ClaudeSettingsTab } from './settings/SettingsTab';
import { ClaudeService } from './services/ClaudeService';

export default class ClaudePlugin extends Plugin {
  settings: ClaudePluginSettings = DEFAULT_SETTINGS;
  claudeService: ClaudeService | null = null;

  async onload() {
    // 설정 로드
    await this.loadSettings();

    // Claude 서비스 초기화
    this.claudeService = new ClaudeService(this.settings.claudePath);
    this.claudeService.updateSettings({
      autoApproveReadOnly: this.settings.autoApproveReadOnly,
      rememberApprovedTools: this.settings.rememberApprovedTools,
      systemPrompt: this.settings.systemPrompt,
    });

    // 뷰 등록
    this.registerView(
      VIEW_TYPE_CLAUDE,
      (leaf) => new ClaudeView(leaf, this)
    );

    // 리본 아이콘 추가
    this.addRibbonIcon('message-square', 'Open Claude', () => {
      this.activateView();
    });

    // 커맨드 등록
    this.addCommand({
      id: 'open-claude-view',
      name: 'Open Claude Chat',
      callback: () => {
        this.activateView();
      },
    });

    this.addCommand({
      id: 'send-selection-to-claude',
      name: 'Send Selection to Claude',
      editorCallback: (editor) => {
        const selection = editor.getSelection();
        if (selection) {
          this.activateView().then((view) => {
            if (view) {
              view.setSelectionContext(selection);
            }
          });
        }
      },
    });

    // 설정 탭 추가
    this.addSettingTab(new ClaudeSettingsTab(this.app, this));

    // 초기 CLI 상태 확인
    this.checkClaudeStatus();
  }

  onunload() {
    this.claudeService?.shutdown();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);

    // 서비스 설정 업데이트
    if (this.claudeService) {
      this.claudeService.updateSettings({
        claudePath: this.settings.claudePath,
        autoApproveReadOnly: this.settings.autoApproveReadOnly,
        rememberApprovedTools: this.settings.rememberApprovedTools,
        systemPrompt: this.settings.systemPrompt,
      });
    }
  }

  async activateView(): Promise<ClaudeView | null> {
    const { workspace } = this.app;

    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_CLAUDE);

    if (leaves.length > 0) {
      // 기존 뷰가 있으면 활성화
      leaf = leaves[0];
    } else {
      // 새 뷰 생성 (오른쪽 사이드바)
      leaf = workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({
          type: VIEW_TYPE_CLAUDE,
          active: true,
        });
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
      return leaf.view as ClaudeView;
    }

    return null;
  }

  async checkClaudeStatus() {
    if (this.claudeService) {
      const status = await this.claudeService.checkAvailability();
      if (status.status !== 'ready') {
        console.log('Claude CLI status:', status);
      }
    }
  }
}
