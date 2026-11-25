// A tiny stack virtual machine, implemented from make.fun's tiny stack ISA v1.
//
// For every /input/<id>/program.bin (with /input/<id>/input.bin) this writes
// /output/<id>/stdout.bin (exactly the bytes the program wrote) and
// /output/<id>/exit.txt (the program's exit code in decimal). The input and
// output directories can be overridden with MAKEFUN_INPUT_DIR /
// MAKEFUN_OUTPUT_DIR. Node builtins only; no network.
//
// Machine summary (from the ISA): 32-bit wrapping values, a data stack of at
// most 256 values, a call stack of at most 64 return addresses, 256 words of
// zeroed memory, at most 1,000,000 executed instructions and at most 65,536
// output bytes per program. A trap ends the program at once with the trap's
// code as its exit code, keeping whatever output was written before it.

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const STACK_LIMIT = 256;
const CALL_LIMIT = 64;
const MEMORY_WORDS = 256;
const STEP_LIMIT = 1_000_000;
const OUTPUT_LIMIT = 65_536;

// Exit codes a trap ends a program with.
const TRAP_UNDERFLOW = 2;
const TRAP_OVERFLOW = 3;
const TRAP_DIV_ZERO = 4;
const TRAP_BAD_OPCODE = 5;
const TRAP_MEMORY = 6;
const TRAP_CALL_DEPTH = 7;
const TRAP_RET_EMPTY = 8;
const TRAP_PC = 9;
const TRAP_STEPS = 10;
const TRAP_OUTPUT = 11;

// How many immediate bytes follow each opcode byte; -1 marks "not an opcode".
const IMMEDIATE_BYTES: Int8Array = (() => {
  const table = new Int8Array(256).fill(-1);
  const defs: Array<[number, number]> = [
    [0x00, 0], [0x01, 1], [0x02, 4], [0x03, 0], [0x04, 0], [0x05, 0], [0x06, 0], [0x07, 0],
    [0x10, 0], [0x11, 0], [0x12, 0], [0x13, 0], [0x14, 0], [0x15, 0], [0x16, 0], [0x17, 0],
    [0x18, 0], [0x19, 0], [0x1a, 0], [0x1b, 0], [0x1c, 0], [0x1d, 0], [0x1e, 0],
    [0x20, 0], [0x21, 0], [0x22, 0],
    [0x30, 2], [0x31, 2], [0x32, 2], [0x33, 2], [0x34, 0],
    [0x40, 0], [0x41, 0],
    [0x50, 0], [0x51, 0], [0x52, 0], [0x53, 0],
  ];
  for (const [byte, imm] of defs) table[byte] = imm;
  return table;
})();

/** The signed 16-bit little-endian immediate at program[pc + 1]. */
function imm16Signed(program: Uint8Array, pc: number): number {
  const v = program[pc + 1] | (program[pc + 2] << 8);
  return v >= 0x8000 ? v - 0x10000 : v;
}

/** Runs one program to its end and answers the bytes it wrote and its exit code. */
function runProgram(program: Uint8Array, input: Uint8Array): { stdout: Buffer; exit: number } {
  const programLength = program.length;
  const stack = new Int32Array(STACK_LIMIT);
  let sp = 0;
  const callStack = new Int32Array(CALL_LIMIT);
  let csp = 0;
  const memory = new Int32Array(MEMORY_WORDS);
  const out = new Uint8Array(OUTPUT_LIMIT);
  let outLength = 0;
  let inputPos = 0;
  let pc = 0;
  let steps = 0;
  let exit: number | null = null;

  while (exit === null) {
    // One step, in the ISA's order: step limit, pc bounds, opcode, immediate fit.
    if (steps >= STEP_LIMIT) {
      exit = TRAP_STEPS;
      break;
    }
    if (pc < 0 || pc >= programLength) {
      exit = TRAP_PC;
      break;
    }
    const opcode = program[pc];
    const imm = IMMEDIATE_BYTES[opcode];
    if (imm < 0) {
      exit = TRAP_BAD_OPCODE;
      break;
    }
    if (pc + imm >= programLength) {
      exit = TRAP_PC;
      break;
    }
    steps++;
    const next = pc + 1 + imm;
    pc = next;

    switch (opcode) {
      case 0x00: // HALT
        exit = 0;
        break;

      case 0x01: { // PUSH8: the byte sign-extended
        if (sp >= STACK_LIMIT) { exit = TRAP_OVERFLOW; break; }
        const byte = program[next - 1];
        stack[sp++] = byte >= 0x80 ? byte - 0x100 : byte;
        break;
      }

      case 0x02: { // PUSH32: four little-endian bytes as a signed 32-bit value
        if (sp >= STACK_LIMIT) { exit = TRAP_OVERFLOW; break; }
        stack[sp++] =
          program[next - 4] |
          (program[next - 3] << 8) |
          (program[next - 2] << 16) |
          (program[next - 1] << 24);
        break;
      }

      case 0x03: // POP
        if (sp < 1) { exit = TRAP_UNDERFLOW; break; }
        sp--;
        break;

      case 0x04: // DUP
        if (sp < 1) { exit = TRAP_UNDERFLOW; break; }
        if (sp >= STACK_LIMIT) { exit = TRAP_OVERFLOW; break; }
        stack[sp] = stack[sp - 1];
        sp++;
        break;

      case 0x05: { // SWAP
        if (sp < 2) { exit = TRAP_UNDERFLOW; break; }
        const top = stack[sp - 1];
        stack[sp - 1] = stack[sp - 2];
        stack[sp - 2] = top;
        break;
      }

      case 0x06: // OVER
        if (sp < 2) { exit = TRAP_UNDERFLOW; break; }
        if (sp >= STACK_LIMIT) { exit = TRAP_OVERFLOW; break; }
        stack[sp] = stack[sp - 2];
        sp++;
        break;

      case 0x07: { // ROT: ( a b c -- b c a )
        if (sp < 3) { exit = TRAP_UNDERFLOW; break; }
        const a = stack[sp - 3];
        stack[sp - 3] = stack[sp - 2];
        stack[sp - 2] = stack[sp - 1];
        stack[sp - 1] = a;
        break;
      }

      case 0x10: // ADD
      case 0x11: // SUB
      case 0x12: // MUL
      case 0x13: // DIV
      case 0x14: // MOD
      case 0x15: // DIVU
      case 0x16: // MODU
      case 0x18: // AND
      case 0x19: // OR
      case 0x1a: // XOR
      case 0x1c: // SHL
      case 0x1d: // SHR
      case 0x1e: // SHRU
      case 0x20: // EQ
      case 0x21: // LT
      case 0x22: { // LTU
        if (sp < 2) { exit = TRAP_UNDERFLOW; break; }
        const b = stack[--sp];
        const a = stack[sp - 1];
        let r: number;
        switch (opcode) {
          case 0x10: r = (a + b) | 0; break;
          case 0x11: r = (a - b) | 0; break;
          case 0x12: r = Math.imul(a, b); break;
          case 0x13:
            if (b === 0) { exit = TRAP_DIV_ZERO; r = 0; break; }
            // Truncated toward zero; the one overflowing quotient,
            // -2147483648 / -1, wraps back to -2147483648 through | 0.
            r = Math.trunc(a / b) | 0;
            break;
          case 0x14:
            if (b === 0) { exit = TRAP_DIV_ZERO; r = 0; break; }
            // JS % already takes the sign of the dividend, as the ISA asks.
            r = (a % b) | 0;
            break;
          case 0x15:
            if (b === 0) { exit = TRAP_DIV_ZERO; r = 0; break; }
            r = Math.trunc((a >>> 0) / (b >>> 0)) | 0;
            break;
          case 0x16:
            if (b === 0) { exit = TRAP_DIV_ZERO; r = 0; break; }
            r = ((a >>> 0) % (b >>> 0)) | 0;
            break;
          case 0x18: r = a & b; break;
          case 0x19: r = a | b; break;
          case 0x1a: r = a ^ b; break;
          case 0x1c: r = a << (b & 31); break;
          case 0x1d: r = a >> (b & 31); break;
          case 0x1e: r = (a >>> (b & 31)) | 0; break;
          case 0x20: r = a === b ? 1 : 0; break;
          case 0x21: r = a < b ? 1 : 0; break;
          default: r = (a >>> 0) < (b >>> 0) ? 1 : 0; break; // LTU
        }
        if (exit === null) stack[sp - 1] = r;
        break;
      }

      case 0x17: // NEG
        if (sp < 1) { exit = TRAP_UNDERFLOW; break; }
        stack[sp - 1] = (-stack[sp - 1]) | 0;
        break;

      case 0x1b: // NOT
        if (sp < 1) { exit = TRAP_UNDERFLOW; break; }
        stack[sp - 1] = ~stack[sp - 1];
        break;

      case 0x30: // JMP
        pc = next + imm16Signed(program, pc - 3);
        break;

      case 0x31: // JZ
        if (sp < 1) { exit = TRAP_UNDERFLOW; break; }
        if (stack[--sp] === 0) pc = next + imm16Signed(program, pc - 3);
        break;

      case 0x32: // JNZ
        if (sp < 1) { exit = TRAP_UNDERFLOW; break; }
        if (stack[--sp] !== 0) pc = next + imm16Signed(program, pc - 3);
        break;

      case 0x33: { // CALL: the immediate is an unsigned absolute address
        if (csp >= CALL_LIMIT) { exit = TRAP_CALL_DEPTH; break; }
        callStack[csp++] = next;
        pc = program[pc - 2] | (program[pc - 1] << 8);
        break;
      }

      case 0x34: // RET
        if (csp < 1) { exit = TRAP_RET_EMPTY; break; }
        pc = callStack[--csp];
        break;

      case 0x40: { // LOAD
        if (sp < 1) { exit = TRAP_UNDERFLOW; break; }
        const addr = stack[sp - 1];
        if (addr < 0 || addr >= MEMORY_WORDS) { exit = TRAP_MEMORY; break; }
        stack[sp - 1] = memory[addr];
        break;
      }

      case 0x41: { // STORE: ( v addr -- )
        if (sp < 2) { exit = TRAP_UNDERFLOW; break; }
        const addr = stack[sp - 1];
        if (addr < 0 || addr >= MEMORY_WORDS) { exit = TRAP_MEMORY; break; }
        memory[addr] = stack[sp - 2];
        sp -= 2;
        break;
      }

      case 0x50: { // PRINT: the value in decimal ASCII
        if (sp < 1) { exit = TRAP_UNDERFLOW; break; }
        const text = String(stack[sp - 1]);
        if (outLength + text.length > OUTPUT_LIMIT) { exit = TRAP_OUTPUT; break; }
        sp--;
        for (let i = 0; i < text.length; i++) out[outLength++] = text.charCodeAt(i);
        break;
      }

      case 0x51: // PUTC: one byte, v AND 255
        if (sp < 1) { exit = TRAP_UNDERFLOW; break; }
        if (outLength + 1 > OUTPUT_LIMIT) { exit = TRAP_OUTPUT; break; }
        out[outLength++] = stack[--sp] & 255;
        break;

      case 0x52: // IN: the next input byte, -1 once the input is used up
        if (sp >= STACK_LIMIT) { exit = TRAP_OVERFLOW; break; }
        stack[sp++] = inputPos < input.length ? input[inputPos++] : -1;
        break;

      case 0x53: // EXIT: exit with code v AND 255
        if (sp < 1) { exit = TRAP_UNDERFLOW; break; }
        exit = stack[--sp] & 255;
        break;
    }
  }

  return { stdout: Buffer.from(out.subarray(0, outLength)), exit: exit ?? 0 };
}

for (const id of readdirSync(INPUT_DIR).sort()) {
  const program = readFileSync(join(INPUT_DIR, id, 'program.bin'));
  let input: Buffer;
  try {
    input = readFileSync(join(INPUT_DIR, id, 'input.bin'));
  } catch {
    input = Buffer.alloc(0);
  }
  const { stdout, exit } = runProgram(program, input);
  mkdirSync(join(OUTPUT_DIR, id), { recursive: true });
  writeFileSync(join(OUTPUT_DIR, id, 'stdout.bin'), stdout);
  writeFileSync(join(OUTPUT_DIR, id, 'exit.txt'), `${exit}\n`);
}
