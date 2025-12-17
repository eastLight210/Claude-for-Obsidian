import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import type ClaudePlugin from '../main';

export class ClaudeSettingsTab extends PluginSettingTab {
  plugin: ClaudePlugin;

  constructor(app: App, plugin: ClaudePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Claude for Obsidian Settings' });

    // Claude CLI 설정 섹션
    containerEl.createEl('h3', { text: 'Claude CLI' });

    new Setting(containerEl)
      .setName('Claude CLI path')
      .setDesc('Path to the Claude CLI executable. Default is "claude" (uses system PATH).')
      .addText((text) =>
        text
          .setPlaceholder('claude')
          .setValue(this.plugin.settings.claudePath)
          .onChange(async (value) => {
            this.plugin.settings.claudePath = value || 'claude';
            await this.plugin.saveSettings();
          })
      )
      .addButton((button) =>
        button
          .setButtonText('Test')
          .onClick(async () => {
            if (this.plugin.claudeService) {
              const status = await this.plugin.claudeService.checkAvailability();
              if (status.status === 'ready') {
                new Notice(`Claude CLI is ready! Version: ${status.version || 'unknown'}`);
              } else {
                new Notice(`Error: ${status.message}`);
              }
            }
          })
      );

    // 컨텍스트 설정 섹션
    containerEl.createEl('h3', { text: 'Context' });

    new Setting(containerEl)
      .setName('Include current document by default')
      .setDesc('Automatically include the active document as context when sending messages.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.includeCurrentNote)
          .onChange(async (value) => {
            this.plugin.settings.includeCurrentNote = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Maximum context length')
      .setDesc('Maximum number of characters to include as context. Larger values may cause slower responses.')
      .addText((text) =>
        text
          .setPlaceholder('50000')
          .setValue(String(this.plugin.settings.maxContextLength))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num > 0) {
              this.plugin.settings.maxContextLength = num;
              await this.plugin.saveSettings();
            }
          })
      );

    // 시스템 프롬프트 섹션
    containerEl.createEl('h3', { text: 'System Prompt' });

    new Setting(containerEl)
      .setName('System prompt')
      .setDesc('Instructions prepended to every message. Use this to guide Claude\'s behavior.')
      .addTextArea((text) => {
        text
          .setPlaceholder('Enter system prompt...')
          .setValue(this.plugin.settings.systemPrompt)
          .onChange(async (value) => {
            this.plugin.settings.systemPrompt = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 6;
        text.inputEl.cols = 50;
        text.inputEl.style.width = '100%';
      });

    // 응답 설정 섹션
    containerEl.createEl('h3', { text: 'Response' });

    new Setting(containerEl)
      .setName('Auto-copy responses')
      .setDesc('Automatically copy Claude responses to clipboard.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoCopyResponse)
          .onChange(async (value) => {
            this.plugin.settings.autoCopyResponse = value;
            await this.plugin.saveSettings();
          })
      );

    // 히스토리 설정 섹션
    containerEl.createEl('h3', { text: 'History' });

    new Setting(containerEl)
      .setName('History limit')
      .setDesc('Maximum number of messages to keep in conversation history.')
      .addText((text) =>
        text
          .setPlaceholder('50')
          .setValue(String(this.plugin.settings.historyLimit))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num > 0) {
              this.plugin.settings.historyLimit = num;
              await this.plugin.saveSettings();
            }
          })
      );

    // 권한 설정 섹션
    containerEl.createEl('h3', { text: 'Permissions' });

    new Setting(containerEl)
      .setName('Auto-approve read-only tools')
      .setDesc('Automatically approve tools that only read data (View, Glob, Grep, etc.) without asking.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoApproveReadOnly)
          .onChange(async (value) => {
            this.plugin.settings.autoApproveReadOnly = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Remember approved tools')
      .setDesc('Remember tools you approve during a session, so you won\'t be asked again for the same tool.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.rememberApprovedTools)
          .onChange(async (value) => {
            this.plugin.settings.rememberApprovedTools = value;
            await this.plugin.saveSettings();
          })
      );

    // 도움말 섹션
    containerEl.createEl('h3', { text: 'Help' });

    const helpDiv = containerEl.createDiv({ cls: 'claude-settings-help' });
    helpDiv.innerHTML = `
      <p><strong>Requirements:</strong></p>
      <ul>
        <li>Claude Code CLI must be installed on your system</li>
        <li>You must be logged in with your Claude Pro subscription</li>
      </ul>
      <p><strong>Installation:</strong></p>
      <ol>
        <li>Download Claude CLI from <a href="https://claude.ai/download">claude.ai/download</a></li>
        <li>Run <code>claude login</code> in your terminal</li>
        <li>Authenticate with your Claude Pro account</li>
      </ol>
      <p><strong>Troubleshooting:</strong></p>
      <ul>
        <li>If the CLI is not found, specify the full path (e.g., <code>/usr/local/bin/claude</code>)</li>
        <li>On Windows, use the full path including <code>.exe</code></li>
        <li>Ensure the CLI is in your system PATH or specify the full path above</li>
      </ul>
    `;
  }
}
