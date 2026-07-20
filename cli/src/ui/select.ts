import type { Readable, Writable } from 'node:stream';

export type Choice<T> = {
  value: T;
  label: string;
  hint?: string;
};

export type SelectStreams = {
  input: Readable & {
    isTTY?: boolean;
    setRawMode?: (mode: boolean) => void;
    resume?: () => void;
    pause?: () => void;
  };
  output: Writable & { isTTY?: boolean };
};

export type Key =
  | { name: 'up' }
  | { name: 'down' }
  | { name: 'space' }
  | { name: 'enter' }
  | { name: 'escape' }
  | { name: 'ctrlc' }
  | { name: 'char'; char: string };

/** Parse a raw terminal chunk into a key event (exported for tests). */
export function parseKey(chunk: string): Key | null {
  if (chunk === '\u0003') return { name: 'ctrlc' };
  if (chunk === '\r' || chunk === '\n') return { name: 'enter' };
  if (chunk === ' ') return { name: 'space' };
  if (chunk === '\u001b' || chunk === '\u001b\u001b') return { name: 'escape' };
  if (chunk === '\u001b[A' || chunk === '\u001bOA') return { name: 'up' };
  if (chunk === '\u001b[B' || chunk === '\u001bOB') return { name: 'down' };
  // Some terminals send multi-byte; ignore unknown escape sequences
  if (chunk.startsWith('\u001b')) return null;
  if (chunk.length === 1) return { name: 'char', char: chunk };
  return null;
}

async function readKeys(
  input: SelectStreams['input'],
  onKey: (key: Key) => boolean | void | Promise<boolean | void>,
): Promise<void> {
  const wasRaw = Boolean((input as { isRaw?: boolean }).isRaw);
  if (typeof input.setRawMode === 'function') {
    input.setRawMode(true);
  }
  input.resume?.();

  try {
    for await (const chunk of input as AsyncIterable<string | Buffer>) {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      // A chunk may contain multiple keys; walk char-by-char for simple ones,
      // but treat common CSI sequences as units.
      let i = 0;
      while (i < text.length) {
        let piece = text[i]!;
        if (piece === '\u001b') {
          // CSI / SS3 sequences
          if (text[i + 1] === '[') {
            let j = i + 2;
            while (j < text.length && /[0-9;]/.test(text[j]!)) j += 1;
            if (j < text.length) {
              piece = text.slice(i, j + 1);
              i = j + 1;
            } else {
              piece = text.slice(i);
              i = text.length;
            }
          } else if (text[i + 1] === 'O' && i + 2 < text.length) {
            piece = text.slice(i, i + 3);
            i += 3;
          } else {
            i += 1;
          }
        } else {
          i += 1;
        }
        const key = parseKey(piece);
        if (!key) continue;
        const done = await onKey(key);
        if (done) return;
      }
    }
  } finally {
    if (typeof input.setRawMode === 'function') {
      input.setRawMode(wasRaw);
    }
  }
}

function clearRendered(output: Writable, lineCount: number) {
  if (lineCount <= 0) return;
  // Move cursor up and clear each line
  for (let i = 0; i < lineCount; i++) {
    output.write('\x1b[2K');
    if (i < lineCount - 1) output.write('\x1b[1A');
  }
  output.write('\r');
}

export async function selectOne<T>(opts: {
  message: string;
  choices: Choice<T>[];
  initialIndex?: number;
  hint?: string;
  streams: SelectStreams;
}): Promise<T> {
  const { message, choices, streams } = opts;
  if (!choices.length) throw new Error('selectOne: no choices');
  let index = Math.min(Math.max(opts.initialIndex ?? 0, 0), choices.length - 1);
  let lines = 0;

  const render = () => {
    clearRendered(streams.output, lines);
    const parts: string[] = [];
    parts.push(message);
    if (opts.hint) parts.push(opts.hint);
    for (let i = 0; i < choices.length; i++) {
      const c = choices[i]!;
      const cursor = i === index ? '›' : ' ';
      const hint = c.hint ? `  \x1b[2m${c.hint}\x1b[0m` : '';
      const label = i === index ? `\x1b[36m${c.label}\x1b[0m` : c.label;
      parts.push(`  ${cursor} ${label}${hint}`);
    }
    const text = `${parts.join('\n')}\n`;
    lines = parts.length;
    streams.output.write(text);
  };

  streams.output.write('\x1b[?25l'); // hide cursor
  try {
    render();
    await readKeys(streams.input, (key) => {
      if (key.name === 'ctrlc') {
        streams.output.write('\n');
        throw new Error('Aborted');
      }
      if (key.name === 'up') {
        index = (index - 1 + choices.length) % choices.length;
        render();
        return false;
      }
      if (key.name === 'down') {
        index = (index + 1) % choices.length;
        render();
        return false;
      }
      if (key.name === 'enter') {
        return true;
      }
      return false;
    });
  } finally {
    streams.output.write('\x1b[?25h'); // show cursor
  }

  // Leave final selection visible as a single line
  clearRendered(streams.output, lines);
  streams.output.write(`${message} \x1b[32m${choices[index]!.label}\x1b[0m\n`);
  return choices[index]!.value;
}

export async function multiSelect<T>(opts: {
  message: string;
  choices: Choice<T>[];
  initialSelected?: boolean[];
  hint?: string;
  streams: SelectStreams;
}): Promise<T[]> {
  const { message, choices, streams } = opts;
  if (!choices.length) return [];
  let index = 0;
  const selected = choices.map((_, i) => Boolean(opts.initialSelected?.[i]));
  let lines = 0;

  const render = () => {
    clearRendered(streams.output, lines);
    const parts: string[] = [];
    parts.push(message);
    parts.push(
      opts.hint ??
        '↑/↓ move · space toggle · a all · n none · enter confirm',
    );
    for (let i = 0; i < choices.length; i++) {
      const c = choices[i]!;
      const cursor = i === index ? '›' : ' ';
      const box = selected[i] ? '◉' : '○';
      const hint = c.hint ? `  \x1b[2m${c.hint}\x1b[0m` : '';
      const label = i === index ? `\x1b[36m${c.label}\x1b[0m` : c.label;
      parts.push(`  ${cursor} ${box} ${label}${hint}`);
    }
    const text = `${parts.join('\n')}\n`;
    lines = parts.length;
    streams.output.write(text);
  };

  streams.output.write('\x1b[?25l');
  try {
    render();
    await readKeys(streams.input, (key) => {
      if (key.name === 'ctrlc') {
        streams.output.write('\n');
        throw new Error('Aborted');
      }
      if (key.name === 'up') {
        index = (index - 1 + choices.length) % choices.length;
        render();
        return false;
      }
      if (key.name === 'down') {
        index = (index + 1) % choices.length;
        render();
        return false;
      }
      if (key.name === 'space') {
        selected[index] = !selected[index];
        render();
        return false;
      }
      if (key.name === 'char' && (key.char === 'a' || key.char === 'A')) {
        for (let i = 0; i < selected.length; i++) selected[i] = true;
        render();
        return false;
      }
      if (key.name === 'char' && (key.char === 'n' || key.char === 'N')) {
        for (let i = 0; i < selected.length; i++) selected[i] = false;
        render();
        return false;
      }
      if (key.name === 'enter') {
        return true;
      }
      return false;
    });
  } finally {
    streams.output.write('\x1b[?25h');
  }

  const values = choices.filter((_, i) => selected[i]).map((c) => c.value);
  clearRendered(streams.output, lines);
  streams.output.write(
    `${message} \x1b[32m${values.length ? values.map(String).join(', ') : '(none)'}\x1b[0m\n`,
  );
  return values;
}
