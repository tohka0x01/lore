import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { ALL_CHANNELS, type ChannelId, type Lang } from '../core/types.js';
import type { InstallSnapshot } from '../core/snapshot.js';
import { multiSelect, selectOne, type SelectStreams } from './select.js';

export type ConnectionMode = 'saas' | 'external' | 'docker';
export type ExistingAction = 'update' | 'reconfigure' | 'manage' | 'uninstall' | 'status' | 'exit';
export type FirstRunAction = ConnectionMode;
export type ReleaseChannel = 'stable' | 'pre' | 'dev';

export type PromptService = {
  pickLanguage(defaultLang: Lang): Promise<Lang>;
  showStatus(text: string): void;
  pickFirstRunAction(): Promise<FirstRunAction>;
  pickExistingAction(): Promise<ExistingAction>;
  askBaseUrl(defaultValue?: string): Promise<string>;
  askToken(opts?: { required?: boolean; hasExisting?: boolean }): Promise<string>;
  pickChannels(opts: {
    defaults: ChannelId[];
    snapshot: InstallSnapshot;
    purpose: 'install' | 'uninstall';
  }): Promise<ChannelId[]>;
  pickRelease(defaultRelease?: ReleaseChannel): Promise<ReleaseChannel>;
  confirm(summary: string): Promise<boolean>;
  askYesNo(question: string, defaultYes?: boolean): Promise<boolean>;
};

export type CreateTTYPromptOptions = {
  lang?: Lang;
  io?: SelectStreams;
  /** Inject selectors for unit tests (skip raw-mode UI). */
  selectOne?: typeof selectOne;
  multiSelect?: typeof multiSelect;
};

function q(lang: Lang, en: string, zh: string): string {
  return lang === 'zh' ? zh : en;
}

export function createNullPrompt(): PromptService {
  return {
    async pickLanguage(defaultLang) {
      return defaultLang;
    },
    showStatus() {},
    async pickFirstRunAction() {
      return 'saas';
    },
    async pickExistingAction() {
      return 'update';
    },
    async askBaseUrl(defaultValue = 'http://127.0.0.1:18901') {
      return defaultValue;
    },
    async askToken() {
      return '';
    },
    async pickChannels(opts) {
      return opts.defaults.length ? opts.defaults : [...ALL_CHANNELS];
    },
    async pickRelease(defaultRelease = 'stable') {
      return defaultRelease;
    },
    async confirm() {
      return true;
    },
    async askYesNo(_q, defaultYes = true) {
      return defaultYes;
    },
  };
}

export function createTTYPrompt(opts: CreateTTYPromptOptions = {}): PromptService {
  let lang: Lang = opts.lang ?? 'en';
  const streams: SelectStreams = opts.io ?? {
    input: input as SelectStreams['input'],
    output: output as SelectStreams['output'],
  };
  const out = streams.output;
  const doSelectOne = opts.selectOne ?? selectOne;
  const doMultiSelect = opts.multiSelect ?? multiSelect;

  async function withRl<T>(fn: (rl: readline.Interface) => Promise<T>): Promise<T> {
    const rl = readline.createInterface({
      input: streams.input as typeof input,
      output: streams.output as typeof output,
      terminal: true,
    });
    try {
      return await fn(rl);
    } finally {
      rl.close();
    }
  }

  async function ask(rl: readline.Interface, prompt: string, defaultValue = ''): Promise<string> {
    const suffix = defaultValue ? ` [${defaultValue}]` : '';
    const answer = await rl.question(`${prompt}${suffix}: `);
    const trimmed = answer.trim();
    return trimmed || defaultValue;
  }

  function write(text: string) {
    out.write(text.endsWith('\n') ? text : `${text}\n`);
  }

  const navHint = () =>
    q(lang, '↑/↓ move · enter select', '↑/↓ 移动 · enter 选择');
  const multiHint = () =>
    q(
      lang,
      '↑/↓ move · space toggle · a all · n none · enter confirm',
      '↑/↓ 移动 · 空格切换 · a 全选 · n 全不选 · enter 确认',
    );

  return {
    async pickLanguage(defaultLang) {
      const value = await doSelectOne({
        message: 'Language / 语言',
        hint: '↑/↓ · enter',
        initialIndex: defaultLang === 'zh' ? 1 : 0,
        choices: [
          { value: 'en' as Lang, label: 'English' },
          { value: 'zh' as Lang, label: '中文' },
        ],
        streams,
      });
      lang = value;
      return lang;
    },

    showStatus(text: string) {
      write(`\n${text}\n`);
    },

    async pickFirstRunAction() {
      return doSelectOne({
        message: q(lang, 'What do you want to do?', '你要做什么？'),
        hint: navHint(),
        choices: [
          {
            value: 'saas' as const,
            label: q(lang, 'Connect Loremem SaaS', '连接 Loremem SaaS'),
            hint: q(lang, 'token only', '只填 Token'),
          },
          {
            value: 'external' as const,
            label: q(lang, 'Connect external server', '连接外部服务'),
            hint: q(lang, 'URL + token', '地址 + Token'),
          },
          {
            value: 'docker' as const,
            label: q(lang, 'Local Docker self-host', '本机 Docker 自托管'),
          },
        ],
        streams,
      });
    },

    async pickExistingAction() {
      return doSelectOne({
        message: q(lang, 'What do you want to do?', '你要做什么？'),
        hint: navHint(),
        choices: [
          {
            value: 'update' as const,
            label: q(lang, 'Update selected plugins', '更新所选插件'),
            hint: q(lang, 'keep server/token', '保留服务与 Token'),
          },
          {
            value: 'reconfigure' as const,
            label: q(lang, 'Reconfigure connection', '重新配置连接'),
            hint: 'SaaS / external / Docker',
          },
          {
            value: 'manage' as const,
            label: q(lang, 'Manage plugins only', '仅管理插件'),
          },
          {
            value: 'uninstall' as const,
            label: q(lang, 'Uninstall plugins', '卸载插件'),
          },
          {
            value: 'status' as const,
            label: q(lang, 'Status only / exit', '只看状态 / 退出'),
          },
        ],
        streams,
      });
    },

    async askBaseUrl(defaultValue = 'http://127.0.0.1:18901') {
      return withRl(async (rl) => {
        const value = await ask(rl, q(lang, 'Server base URL', '服务地址'), defaultValue);
        return value.replace(/\/$/, '');
      });
    },

    async askToken(tokenOpts = {}) {
      return withRl(async (rl) => {
        const required = tokenOpts.required ?? false;
        const hasExisting = tokenOpts.hasExisting ?? false;
        const promptText = hasExisting
          ? q(lang, 'API token (Enter keeps existing)', 'API Token（回车保留已有）')
          : q(lang, 'API token', 'API Token');
        for (;;) {
          const value = await ask(rl, promptText, '');
          if (value) return value;
          if (!required || hasExisting) return '';
          write(q(lang, 'Token is required for SaaS.', 'SaaS 必须填写 Token。'));
        }
      });
    },

    async pickChannels(opts) {
      const defaults = new Set(opts.defaults.length ? opts.defaults : [...ALL_CHANNELS]);
      const choices = ALL_CHANNELS.map((id) => {
        const st = opts.snapshot.channels.find((c) => c.id === id);
        const cliOn = opts.snapshot.detectedChannels.includes(id);
        return {
          value: id,
          label: id,
          hint: `CLI:${cliOn ? 'yes' : 'no'}  ${st?.state ?? 'unknown'}`,
        };
      });
      const initialSelected = ALL_CHANNELS.map((id) => defaults.has(id));
      const selected = await doMultiSelect({
        message: q(
          lang,
          `Select channels (${opts.purpose})`,
          `选择渠道（${opts.purpose === 'uninstall' ? '卸载' : '安装'}）`,
        ),
        hint: multiHint(),
        choices,
        initialSelected,
        streams,
      });
      return selected;
    },

    async pickRelease(defaultRelease = 'stable') {
      const initial =
        defaultRelease === 'dev' ? 2 : defaultRelease === 'pre' ? 1 : 0;
      return doSelectOne({
        message: q(lang, 'Release channel', '发布通道'),
        hint: navHint(),
        initialIndex: initial,
        choices: [
          { value: 'stable' as const, label: 'stable' },
          { value: 'pre' as const, label: 'pre' },
          { value: 'dev' as const, label: 'dev' },
        ],
        streams,
      });
    },

    async confirm(summary: string) {
      write(`\n${summary}\n`);
      return doSelectOne({
        message: q(lang, 'Proceed?', '确认开始？'),
        hint: navHint(),
        initialIndex: 0,
        choices: [
          { value: true, label: q(lang, 'Yes', '是') },
          { value: false, label: q(lang, 'No', '否') },
        ],
        streams,
      });
    },

    async askYesNo(question: string, defaultYes = true) {
      return doSelectOne({
        message: question,
        hint: navHint(),
        initialIndex: defaultYes ? 0 : 1,
        choices: [
          { value: true, label: q(lang, 'Yes', '是') },
          { value: false, label: q(lang, 'No', '否') },
        ],
        streams,
      });
    },
  };
}
