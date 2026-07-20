import assert from 'node:assert/strict';
import test from 'node:test';
import { parseKey, selectOne, multiSelect } from '../src/ui/select.ts';
import { PassThrough } from 'node:stream';

test('parseKey maps arrows space enter ctrlc', () => {
  assert.equal(parseKey('\u001b[A')?.name, 'up');
  assert.equal(parseKey('\u001b[B')?.name, 'down');
  assert.equal(parseKey(' ')?.name, 'space');
  assert.equal(parseKey('\r')?.name, 'enter');
  assert.equal(parseKey('\u0003')?.name, 'ctrlc');
  assert.equal(parseKey('a')?.name, 'char');
});

function fakeStreams(keys: string[]) {
  const input = new PassThrough({ encoding: 'utf8' });
  const output = new PassThrough();
  // No setRawMode — still works via async iteration
  setImmediate(() => {
    for (const k of keys) input.write(k);
    input.end();
  });
  return {
    input: input as never,
    output: output as never,
  };
}

test('selectOne moves down then enter', async () => {
  const streams = fakeStreams(['\u001b[B', '\r']);
  const value = await selectOne({
    message: 'pick',
    choices: [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
      { value: 'c', label: 'C' },
    ],
    streams,
  });
  assert.equal(value, 'b');
});

test('multiSelect toggles with space and confirms', async () => {
  // start with first selected via initialSelected [true,false]
  // down, space (select second), enter
  const streams = fakeStreams(['\u001b[B', ' ', '\r']);
  const values = await multiSelect({
    message: 'channels',
    choices: [
      { value: 'pi', label: 'pi' },
      { value: 'codex', label: 'codex' },
    ],
    initialSelected: [true, false],
    streams,
  });
  assert.deepEqual(values, ['pi', 'codex']);
});
