/**
 * Disassembler architecture type.
 *
 * Defines the CPU architecture for disassembly display
 * in the EFEL memory viewer.
 */
export type DisasmArch =
  | 'off'
  | 'arm'
  | 'arm_thumb'
  | 'arm64'
  | 'x86'
  | 'x86_64'
  | 'mips'
  | 'mips64'
  | 'ppc'
  | 'ppc64'
  | 'risc_v32'
  | 'risc_v64'
  | 'sparc'
  | 'system_z';

/**
 * Disassembled instruction structure.
 *
 * Contains the details of a single disassembled instruction
 * including address, bytes, and mnemonic representation.
 */
export interface DisasmInstruction {
  /** Instruction address in memory */
  address: number;
  /** Instruction size in bytes */
  size: number;
  /** Raw instruction bytes */
  bytes: number[];
  /** Instruction mnemonic (e.g., 'mov', 'ldr') */
  mnemonic: string;
  /** Operand string */
  op_str: string;
}

/**
 * Disassembly result structure.
 *
 * Contains all disassembled instructions or error message
 * if disassembly failed.
 */
export interface DisasmResult {
  /** Array of disassembled instructions */
  instructions: DisasmInstruction[];
  /** Error message if disassembly failed */
  error: string | null;
}

/**
 * Log entry structure for EFEL GUI.
 *
 * Contains timestamp, level, and message for display
 * in the EFEL log panel.
 */
export interface LogEntry {
  /** Log timestamp */
  time: Date;
  /** Log level string */
  level: string;
  /** Log message content */
  message: string;
}

/**
 * Architecture options for disassembly dropdown.
 *
 * Array of value/label pairs for selecting disassembly
 * architecture in the EFEL interface.
 */
export const ARCH_OPTIONS: { value: DisasmArch; label: string }[] = [
  { value: 'off', label: '关闭' },
  { value: 'arm', label: 'ARM' },
  { value: 'arm_thumb', label: 'ARM Thumb' },
  { value: 'arm64', label: 'ARM64' },
  { value: 'x86', label: 'x86' },
  { value: 'x86_64', label: 'x86-64' },
  { value: 'mips', label: 'MIPS' },
  { value: 'mips64', label: 'MIPS64' },
  { value: 'ppc', label: 'PPC' },
  { value: 'ppc64', label: 'PPC64' },
  { value: 'risc_v32', label: 'RISC-V 32' },
  { value: 'risc_v64', label: 'RISC-V 64' },
  { value: 'sparc', label: 'SPARC' },
  { value: 'system_z', label: 'SystemZ' },
];