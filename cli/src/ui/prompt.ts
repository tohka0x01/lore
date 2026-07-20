import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { ALL_CHANNELS, type ChannelId, type Lang } from '../core/types.js';
import type { InstallSnapshot } from '../core/snapshot.js';

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
  io?: { input: NodeJS.ReadableStream; output: NodeJS.WritableStream };
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
  const io = opts.io ?? { input, output };
  const out = io.output;

  async function withRl<T>(fn: (rl: readline.Interface) => Promise<T>): Promise<T> {
    const rl = readline.createInterface({
      input: io.input as typeof input,
      output: io.output as typeof output,
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

  return {
    async pickLanguage(defaultLang) {
      return withRl(async (rl) => {
        write('\nLanguage / 语言\n  1) English\n  2) 中文\n');
        const answer = await ask(rl, 'Choose 1 or 2 / 选择 1 或 2', defaultLang === 'zh' ? '2' : '1');
        lang = answer.startsWith('2') || answer.toLowerCase() === 'zh' ? 'zh' : 'en';
        return lang;
      });
    },

    showStatus(text: string) {
      write(`\n${text}\n`);
    },

    async pickFirstRunAction() {
      return withRl(async (rl) => {
        write(
          q(
            lang,
            '\nWhat do you want to do?\n  1) Connect Loremem SaaS (token only)\n  2) Connect external server (URL + token)\n  3) Local Docker self-host\n',
            '\n你要做什么？\n  1) 连接 Loremem SaaS（只填 Token）\n  2) 连接外部服务（地址 + Token）\n  3) 本机 Docker 自托管\n',
          ),
        );
        const answer = await ask(rl, q(lang, 'Choose 1/2/3', '选择 1/2/3'), '1');
        if (answer.startsWith('3')) return 'docker';
        if (answer.startsWith('2')) return 'external';
        return 'saas';
      });
    },

    async pickExistingAction() {
      return withRl(async (rl) => {
        write(
          q(
            lang,
            '\nWhat do you want to do?\n  1) Update selected plugins (keep server/token)\n  2) Reconfigure connection (SaaS / external / Docker)\n  3) Manage plugins only\n  4) Uninstall plugins\n  5) Status only / exit\n',
            '\n你要做什么？\n  1) 更新所选插件（保留服务与 Token）\n  2) 重新配置连接（SaaS / 外部 / Docker）\n  3) 仅管理插件\n  4) 卸载插件\n  5) 只看状态 / 退出\n',
          ),
        );
        const answer = await ask(rl, q(lang, 'Choose 1-5', '选择 1-5'), '1');
        if (answer.startsWith('2')) return 'reconfigure';
        if (answer.startsWith('3')) return 'manage';
        if (answer.startsWith('4')) return 'uninstall';
        if (answer.startsWith('5')) return 'status';
        return 'update';
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
          ? q(
              lang,
              'API token (Enter keeps existing)',
              'API Token（回车保留已有）',
            )
          : q(lang, 'API token', 'API Token');
        // loop until provided when required and no existing
        for (;;) {
          const value = await ask(rl, promptText, '');
          if (value) return value;
          if (!required || hasExisting) return '';
          write(q(lang, 'Token is required for SaaS.', 'SaaS 必须填写 Token。'));
        }
      });
    },

    async pickChannels(opts) {
      return withRl(async (rl) => {
        const defaults = opts.defaults.length ? opts.defaults : [...ALL_CHANNELS];
        write(
          q(
            lang,
            `\nSelect channels (comma-separated). Purpose: ${opts.purpose}\n  all = every channel, none = empty\n`,
            `\n选择渠道（逗号分隔）。用途：${opts.purpose === 'uninstall' ? '卸载' : '安装'}\n  all = 全部，none = 空\n`,
          ),
        );
        for (const id of ALL_CHANNELS) {
          const st = opts.snapshot.channels.find((c) => c.id === id);
          const cliOn = opts.snapshot.detectedChannels.includes(id);
          write(
            `  ${id.padEnd(12)} CLI:${cliOn ? 'yes' : 'no'.padEnd(3)}  state:${st?.state ?? 'unknown'}`,
          );
        }
        write(q(lang, `Default: ${defaults.join(',')}`, `默认：${defaults.join(',')}`));
        const answer = await ask(rl, q(lang, 'Channels', '渠道'), defaults.join(','));
        const normalized = answer.trim().toLowerCase();
        if (normalized === 'all') return [...ALL_CHANNELS];
        if (normalized === 'none' || normalized === '') return [];
        const parts = answer
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean) as ChannelId[];
        const valid = parts.filter((p) => ALL_CHANNELS.includes(p));
        return valid.length ? valid : defaults;
      });
    },

    async pickRelease(defaultRelease = 'stable') {
      return withRl(async (rl) => {
        write(
          q(
            lang,
            '\nRelease channel:\n  1) stable\n  2) pre\n  3) dev\n',
            '\n发布通道：\n  1) stable\n  2) pre\n  3) dev\n',
          ),
        );
        const def =
          defaultRelease === 'dev' ? '3' : defaultRelease === 'pre' ? '2' : '1';
        const answer = await ask(rl, q(lang, 'Choose 1/2/3', '选择 1/2/3'), def);
        if (answer.startsWith('3') || answer === 'dev') return 'dev';
        if (answer.startsWith('2') || answer === 'pre') return 'pre';
        return 'stable';
      });
    },

    async confirm(summary: string) {
      return withRl(async (rl) => {
        write(`\n${summary}\n`);
        const answer = await ask(rl, q(lang, 'Proceed? [Y/n]', '确认开始？[Y/n]'), 'Y');
        return !/^n(o)?$/i.test(answer.trim());
      });
    },

    async askYesNo(question: string, defaultYes = true) {
      return withRl(async (rl) => {
        const def = defaultYes ? 'Y/n' : 'y/N';
        const answer = await ask(rl, `${question} [${def}]`, defaultYes ? 'Y' : 'N');
        if (!answer) return defaultYes;
        return /^y(es)?$/i.test(answer.trim());
      });
    },
  };
}
