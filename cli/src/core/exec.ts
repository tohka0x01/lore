import { spawn } from 'node:child_process';

export type ExecFn = (
  argv: string[],
  opts?: { cwd?: string; env?: NodeJS.ProcessEnv; quiet?: boolean },
) => Promise<{ code: number; stdout: string; stderr: string }>;

export function createExec(): ExecFn {
  return (argv, opts = {}) =>
    new Promise((resolve, reject) => {
      if (!argv.length) {
        reject(new Error('createExec: empty argv'));
        return;
      }
      const [cmd, ...args] = argv;
      const child = spawn(cmd, args, {
        cwd: opts.cwd,
        env: opts.env ? { ...process.env, ...opts.env } : process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });
      child.stderr?.on('data', (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });
      child.on('error', (err) => {
        reject(err);
      });
      child.on('close', (code) => {
        resolve({ code: code ?? 1, stdout, stderr });
      });
    });
}
