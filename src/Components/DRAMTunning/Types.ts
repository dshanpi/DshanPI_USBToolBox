/**
 * Log entry structure for DRAM tuning.
 *
 * Contains timestamp, level, and message for display
 * in the DRAM tuning log panel.
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
 * DRAM test result structure.
 *
 * Contains the initialization result returned after
 * DRAM parameter testing in FEL mode.
 */
export interface DRAMTestResult {
  /** Whether test succeeded */
  success: boolean;
  /** DRAM initialization completion flag */
  dram_init_flag: number;
  /** DRAM parameter update flag */
  dram_update_flag: number;
  /** Return address for init code */
  ret_addr: number;
  /** DRAM timing parameters array */
  dram_para: number[];
}