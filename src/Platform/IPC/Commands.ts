import type { IpcCommandSpec, IpcEventSpec } from './Types';

/**
 * Type map for all IPC commands.
 *
 * Defines argument and result types for every Tauri command,
 * enabling type-safe invocation through invokeCommand.
 * Command names map to IpcCommandSpec with typed args and result.
 */
export interface IpcCommandMap {
  /** Open DevTools window for debugging */
  open_devtools: IpcCommandSpec;
  open_python_api_docs: IpcCommandSpec;
  /** Get system proxy settings as string */
  get_system_proxy: IpcCommandSpec<undefined, string>;
  /** Get proxy configuration as string */
  get_proxy_config: IpcCommandSpec<undefined, string>;

  /** Check ADB server status and version */
  adb_check_server: IpcCommandSpec<
    undefined,
    {
      /** Whether ADB server is running */
      running: boolean;
      /** ADB version info if running */
      version?: {
        /** Full version string */
        version: string;
        /** Major version number */
        major: number;
        /** Minor version number */
        minor: number;
        /** Patch version number */
        patch: number;
      };
      /** ADB server port */
      port: number;
    }
  >;

  /** List connected ADB devices */
  adb_list_devices: IpcCommandSpec<
    undefined,
    Array<{
      /** Device serial number */
      serial: string;
      /** Device state (device, offline, unauthorized) */
      state: string;
      /** Device model name */
      model?: string;
      /** Product name */
      product?: string;
      /** Device identifier */
      device?: string;
      /** Transport ID for connection */
      transport_id?: number;
    }>
  >;

  /** Select an ADB device for subsequent operations */
  adb_select_device: IpcCommandSpec<{ serial: string }>;

  /** Get the currently selected device serial */
  adb_get_selected_device: IpcCommandSpec<undefined, string | null>;

  /** Clear device selection */
  adb_clear_selected_device: IpcCommandSpec;

  /** Execute shell command on ADB device */
  adb_shell_command: IpcCommandSpec<{ serial: string | null; command: string }, string>;

  /** List directory contents on ADB device */
  adb_list_directory: IpcCommandSpec<
    { serial: string | null; path: string },
    {
      /** Directory path listed */
      path: string;
      /** Items in directory */
      items: Array<{
        /** Item name */
        name: string;
        /** Full item path */
        path: string;
        /** File size in bytes */
        size: number;
        /** Whether item is a directory */
        is_directory: boolean;
        /** Modification timestamp */
        modified_time?: number;
        /** Permission string */
        permissions?: string;
      }>;
    }
  >;

  /** Push local file to ADB device */
  adb_push_file: IpcCommandSpec<{ serial: string | null; localPath: string; remotePath: string }>;

  /** Pull file from ADB device to local path */
  adb_pull_file: IpcCommandSpec<{ serial: string | null; remotePath: string; localPath: string }>;

  /** Pull folder from ADB device to local path */
  adb_pull_folder: IpcCommandSpec<{
    serial: string | null;
    remotePath: string;
    localPath: string;
  }>;

  /** Delete file on ADB device */
  adb_delete_file: IpcCommandSpec<{ serial: string | null; path: string }, string>;

  /** Create directory on ADB device */
  adb_make_directory: IpcCommandSpec<{ serial: string | null; path: string }, string>;

  /** Rename file or directory on ADB device */
  adb_rename: IpcCommandSpec<{ serial: string | null; oldPath: string; newPath: string }, string>;

  /** Get file information on ADB device */
  adb_stat: IpcCommandSpec<
    { serial: string | null; path: string },
    {
      /** File name */
      name: string;
      /** Full file path */
      path: string;
      /** File size in bytes */
      size: number;
      /** Whether item is a directory */
      is_directory: boolean;
      /** Modification timestamp */
      modified_time?: number;
      /** Permission string */
      permissions?: string;
    }
  >;

  /** Reboot ADB device */
  adb_reboot: IpcCommandSpec<{ serial: string | null; rebootType: string }>;

  /** Switch ADB device to root mode */
  adb_root: IpcCommandSpec<{ serial: string | null }, string>;

  /** Set USB backend driver type */
  efex_set_usb_backend: IpcCommandSpec<{ backend: 'libusb' | 'winusb' }>;

  /** Get current USB backend driver type */
  efex_get_usb_backend: IpcCommandSpec<undefined, 'libusb' | 'winusb'>;

  /** Scan for connected EFEX devices */
  efex_scan_devices: IpcCommandSpec<
    undefined,
    Array<{
      /** Device identifier from USB */
      device_id: number;
      /** Chip version number */
      chip_version: number;
      /** Device mode */
      mode: 'null' | 'fel' | 'srv' | 'update_cool' | 'update_hot' | 'unknown';
      /** Human-readable mode string */
      mode_str: string;
      /** USB bus number */
      bus: number;
      /** USB port number */
      port: number;
    }>
  >;

  /** Close an EFEX device context */
  efex_close_device: IpcCommandSpec<{ deviceId: number }>;

  /** Get device mode for EFEX device */
  efex_get_device_mode: IpcCommandSpec<
    { deviceId: number },
    'null' | 'fel' | 'srv' | 'update_cool' | 'update_hot' | 'unknown'
  >;

  /** Get human-readable device mode string */
  efex_get_device_mode_str: IpcCommandSpec<{ deviceId: number }, string>;

  /** Set FEL mode operation timeout */
  efex_set_fel_timeout: IpcCommandSpec<{ timeoutSecs: number }>;

  /** Set FES mode operation timeout */
  efex_set_fes_timeout: IpcCommandSpec<{ timeoutSecs: number }>;

  /** Read memory from FEL mode device */
  efex_fel_read: IpcCommandSpec<{ deviceId: number; addr: number; len: number }, number[]>;

  /** Write memory to FEL mode device */
  efex_fel_write: IpcCommandSpec<{ deviceId: number; addr: number; data: number[] }>;

  /** Execute code at address in FEL mode device */
  efex_fel_exec: IpcCommandSpec<{ deviceId: number; addr: number }>;

  /** Initialize DRAM in FEL mode */
  efex_fel_init_dram: IpcCommandSpec<
    { deviceId: number; fexData: number[] },
    {
      /** Whether initialization succeeded */
      success: boolean;
      /** DRAM init completion flag */
      dram_init_flag: number;
      /** DRAM parameter update flag */
      dram_update_flag: number;
      /** Return address for init code */
      ret_addr: number;
      /** DRAM parameters array */
      dram_para: number[];
    }
  >;

  /** Initialize DRAM with custom parameters */
  efex_fel_init_dram_with_params: IpcCommandSpec<
    {
      deviceId: number;
      fexData: number[];
      dramInfo: { dram_init_flag: number; dram_update_flag: number; dram_para: number[] };
    },
    {
      /** Whether initialization succeeded */
      success: boolean;
      /** DRAM init completion flag */
      dram_init_flag: number;
      /** DRAM parameter update flag */
      dram_update_flag: number;
      /** Return address for init code */
      ret_addr: number;
      /** DRAM parameters array */
      dram_para: number[];
    }
  >;

  /** Query storage type in FES mode */
  efex_fes_query_storage: IpcCommandSpec<{ deviceId: number }, number>;

  /** Query secure boot status in FES mode */
  efex_fes_query_secure: IpcCommandSpec<{ deviceId: number }, number>;

  /** Probe flash storage size in FES mode */
  efex_fes_probe_flash_size: IpcCommandSpec<{ deviceId: number }, number>;

  /** Enable/disable flash access in FES mode */
  efex_fes_flash_set_onoff: IpcCommandSpec<{
    deviceId: number;
    storageType: number;
    onOff: boolean;
  }>;

  /** Get chip ID from FES mode device */
  efex_fes_get_chipid: IpcCommandSpec<{ deviceId: number }, string>;

  /** Download data to flash in FES mode */
  efex_fes_down: IpcCommandSpec<{
    deviceId: number;
    buf: number[];
    addr: number;
    dataType: number;
  }>;

  /** Read data from flash in FES mode */
  efex_fes_up: IpcCommandSpec<
    { deviceId: number; len: number; addr: number; dataType: number },
    number[]
  >;

  /** Verify data value in flash */
  efex_fes_verify_value: IpcCommandSpec<
    { deviceId: number; addr: number; size: number },
    { flag: number; fes_crc: number; media_crc: number }
  >;

  /** Verify flash write status */
  efex_fes_verify_status: IpcCommandSpec<
    { deviceId: number; tag: number },
    { flag: number; fes_crc: number; media_crc: number }
  >;

  /** Verify U-Boot block in flash */
  efex_fes_verify_uboot_blk: IpcCommandSpec<
    { deviceId: number; tag: number },
    { flag: number; fes_crc: number; media_crc: number }
  >;

  /** Set tool mode and next mode for FES */
  efex_fes_tool_mode: IpcCommandSpec<{ deviceId: number; toolMode: number; nextMode: number }>;

  /** Initialize payload helper functions */
  efex_payloads_init: IpcCommandSpec<{ arch: string }>;

  /** Read 32-bit value from device memory */
  efex_payloads_readl: IpcCommandSpec<{ deviceId: number; addr: number }, number>;

  /** Write 32-bit value to device memory */
  efex_payloads_writel: IpcCommandSpec<{ deviceId: number; value: number; addr: number }>;

  /** Disassemble binary code */
  disassemble: IpcCommandSpec<
    { data: number[]; address: number; arch: string },
    {
      /** Disassembled instructions */
      instructions: Array<{
        /** Instruction address */
        address: number;
        /** Instruction size in bytes */
        size: number;
        /** Raw instruction bytes */
        bytes: number[];
        /** Instruction mnemonic */
        mnemonic: string;
        /** Operand string */
        op_str: string;
      }>;
      /** Error message if disassembly failed */
      error: string | null;
    }
  >;

  /** Start USB hot-plug monitoring */
  hotplug_start: IpcCommandSpec;

  /** Extract a chunk from a file */
  extract_file_chunked: IpcCommandSpec<
    { sourcePath: string; destPath: string; offset: number; length: number },
    { success: boolean; message: string; bytes_written: number }
  >;

  /** Extract multiple files in batch */
  extract_files_batch: IpcCommandSpec;

  /** Get file size in bytes */
  get_file_size: IpcCommandSpec<{ filePath: string }, number>;

  /** Start flash operation */
  flash_start: IpcCommandSpec<
    {
      deviceId: number;
      bus: number;
      port: number;
      imagePath: string;
      options: {
        /** Flash mode type */
        mode:
          | 'bootloader'
          | 'partition'
          | 'keep_data'
          | 'partition_erase'
          | 'full_erase'
          | 'erase_only';
        /** Partitions to flash (optional) */
        partitions?: string[];
        /** Whether to verify after download */
        verifyDownload: boolean;
        /** Action after flash completes */
        postFlashAction: 'reboot' | 'poweroff' | 'none';
        /** Custom MBR data (optional) */
        mbrData?: number[];
        /** Custom partition config (optional) */
        partitionConfig?: Array<{
          name: string;
          size: number;
          downloadfile: string;
          userType: number;
          keydata: boolean;
          encrypt: boolean;
          verify: boolean;
          ro: boolean;
          customFilePath?: string;
        }>;
      };
    },
    { task_id: number }
  >;

  /** Cancel active flash operation */
  flash_cancel: IpcCommandSpec<{ taskId: number }>;

  /** Confirm a flash request */
  flash_confirm: IpcCommandSpec<{ taskId: number; requestId: number; confirmed: boolean }>;

  /** Start mass production flashing */
  mass_start: IpcCommandSpec<{
    imagePath: string;
    options: {
      /** Flash mode type */
      mode:
        | 'bootloader'
        | 'partition'
        | 'keep_data'
        | 'partition_erase'
        | 'full_erase'
        | 'erase_only';
      /** Partitions to flash (optional) */
      partitions?: string[];
      /** Whether to verify after download */
      verifyDownload: boolean;
      /** Action after flash completes */
      postFlashAction: 'reboot' | 'poweroff' | 'none';
      /** Custom MBR data (optional) */
      mbrData?: number[];
      /** Custom partition config (optional) */
      partitionConfig?: Array<{
        name: string;
        size: number;
        downloadfile: string;
        userType: number;
        keydata: boolean;
        encrypt: boolean;
        verify: boolean;
        ro: boolean;
        customFilePath?: string;
      }>;
    };
    /** Maximum concurrent slots */
    maxSlots: number;
  }>;

  /** Stop mass production flashing */
  mass_stop: IpcCommandSpec;

  /** Get mass production status */
  mass_get_status: IpcCommandSpec<
    undefined,
    {
      /** Current state */
      state: 'stopped' | 'running';
      /** Slot statuses */
      slots: Array<{
        /** Slot identifier */
        id: number;
        /** Slot status */
        status: 'idle' | 'waiting' | 'flashing' | 'success' | 'failed';
        /** USB bus number */
        bus: number | null;
        /** USB port number */
        port: number | null;
        /** Task ID for this slot */
        taskId: number | null;
        /** Progress percentage */
        progress: number;
        /** Current stage name */
        stage: string;
        /** Flash speed string */
        speed: string | null;
        /** Error message */
        error: string | null;
        /** Start timestamp */
        startTime: number | null;
        /** End timestamp */
        endTime: number | null;
        /** Number of flashes completed */
        flashCount: number;
      }>;
      /** Total devices processed */
      total: number;
      /** Successful flashes */
      success: number;
      /** Failed flashes */
      failed: number;
      /** Currently in progress */
      inProgress: number;
    }
  >;

  /** Parse GPT from file */
  parse_gpt_from_file: IpcCommandSpec<
    { filePath: string; sectorSize: number },
    { success: boolean; message: string; gpt_info: unknown | null }
  >;

  /** Parse GPT from binary data */
  parse_gpt_from_data: IpcCommandSpec<
    { data: number[]; sectorSize: number },
    { success: boolean; message: string; gpt_info: unknown | null }
  >;

  /** Parse MBR from file */
  parse_mbr_from_file: IpcCommandSpec<
    { filePath: string; sectorSize: number },
    { success: boolean; message: string; mbr_info: unknown | null; partitions: unknown[] }
  >;

  /** Parse MBR from binary data */
  parse_mbr_from_data: IpcCommandSpec<
    { data: number[]; sectorSize: number },
    { success: boolean; message: string; mbr_info: unknown | null; partitions: unknown[] }
  >;

  /** Parse FDT/DTB from file */
  fdt_parse_from_file: IpcCommandSpec<
    { filePath: string },
    { success: boolean; message: string; fdt_info: unknown | null }
  >;

  /** Parse FDT/DTB from binary data */
  fdt_parse_from_data: IpcCommandSpec<
    { data: number[] },
    { success: boolean; message: string; fdt_info: unknown | null }
  >;

  /** Get FDT node by path */
  fdt_get_node: IpcCommandSpec<
    { data: number[]; nodePath: string },
    { success: boolean; message: string; node: unknown | null }
  >;

  /** Get FDT property by path and name */
  fdt_get_property: IpcCommandSpec<
    { data: number[]; nodePath: string; propertyName: string },
    { success: boolean; message: string; property: unknown | null }
  >;

  /** List FDT node children */
  fdt_list_node_children: IpcCommandSpec<
    { data: number[]; nodePath: string },
    { success: boolean; message: string; children: string[] }
  >;

  /** Find FDT nodes by compatible string */
  fdt_find_compatible: IpcCommandSpec<
    { data: number[]; compatibleString: string },
    { success: boolean; message: string; children: string[] }
  >;

  /** Generate DTS source from FDT binary */
  fdt_generate_dts: IpcCommandSpec<
    { data: number[] },
    { success: boolean; message: string; dts: string | null }
  >;

  /** Parse firmware image file */
  firmware_parse_image: IpcCommandSpec<
    { filePath: string },
    {
      image_info: unknown | null;
      file_headers: unknown[];
      is_encrypted: boolean;
      last_error: string | null;
    }
  >;

  /** Read firmware entry by filename */
  firmware_read_entry_by_filename: IpcCommandSpec<
    { filePath: string; filename: string },
    number[] | null
  >;

  /** Read firmware entry by maintype and subtype */
  firmware_read_entry_by_maintype_subtype: IpcCommandSpec<
    { filePath: string; maintype: string; subtype: string },
    number[] | null
  >;

  /** Read firmware entry range by filename */
  firmware_read_entry_range_by_filename: IpcCommandSpec<
    { filePath: string; filename: string; start: number; length: number },
    number[] | null
  >;

  /** Read firmware entry range by maintype and subtype */
  firmware_read_entry_range_by_maintype_subtype: IpcCommandSpec<
    { filePath: string; maintype: string; subtype: string; start: number; length: number },
    number[] | null
  >;

  /** Parse partition config binary */
  firmware_parse_partition_config: IpcCommandSpec<{ data: number[] }, unknown>;

  /** Serialize partition config to binary */
  firmware_serialize_partition_config: IpcCommandSpec<{ config: unknown }, number[]>;

  /** Parse Boot0 header */
  firmware_parse_boot0: IpcCommandSpec<{ data: number[] }, unknown>;

  /** Serialize Boot0 header to binary */
  firmware_serialize_boot0: IpcCommandSpec<{ header: unknown }, number[]>;

  /** Parse DRAM parameters */
  firmware_parse_dram_params: IpcCommandSpec<{ data: number[] }, unknown>;

  /** Serialize DRAM parameters to binary */
  firmware_serialize_dram_params: IpcCommandSpec<{ info: unknown }, number[]>;

  /** Parse U-Boot binary */
  firmware_parse_uboot: IpcCommandSpec<{ data: number[] }, unknown>;

  /** Get U-Boot work mode */
  firmware_get_uboot_work_mode: IpcCommandSpec<{ data: number[] }, number>;

  /** Get U-Boot storage type */
  firmware_get_uboot_storage_type: IpcCommandSpec<{ data: number[] }, number>;

  /** Set U-Boot work mode */
  firmware_set_uboot_work_mode: IpcCommandSpec<{ data: number[]; mode: number }, number[]>;

  /** Set U-Boot storage type */
  firmware_set_uboot_storage_type: IpcCommandSpec<
    { data: number[]; storageType: number },
    number[]
  >;

  /** Parse sys_config binary */
  firmware_parse_sys_config: IpcCommandSpec<{ data: number[] }, unknown>;

  /** Parse sunxi MBR binary */
  firmware_parse_sunxi_mbr: IpcCommandSpec<{ data: number[] }, unknown>;

  /** Validate sunxi MBR */
  firmware_is_valid_sunxi_mbr: IpcCommandSpec<{ data: number[] }, boolean>;

  /** Convert sunxi MBR to info */
  firmware_sunxi_mbr_to_info: IpcCommandSpec<{ mbr: unknown }, unknown>;

  /** Create empty MBR */
  firmware_mbr_create_empty: IpcCommandSpec<undefined, unknown>;

  /** Add partition to MBR */
  firmware_mbr_add_partition: IpcCommandSpec<
    { mbr: unknown; partition: unknown; beforeIndex?: number },
    unknown
  >;

  /** Add partition to MBR with raw parameters */
  firmware_mbr_add_partition_raw: IpcCommandSpec<
    { mbr: unknown; partition: unknown; beforeIndex?: number },
    unknown
  >;

  /** Update partition in MBR */
  firmware_mbr_update_partition: IpcCommandSpec<
    { mbr: unknown; index: number; partition: unknown },
    unknown
  >;

  /** Remove partition from MBR */
  firmware_mbr_remove_partition: IpcCommandSpec<{ mbr: unknown; index: number }, unknown>;

  /** Move partition in MBR */
  firmware_mbr_move_partition: IpcCommandSpec<
    { mbr: unknown; fromIndex: number; toIndex: number },
    unknown
  >;

  /** Clear all partitions from MBR */
  firmware_mbr_clear_partitions: IpcCommandSpec<{ mbr: unknown }, unknown>;

  /** Set MBR copy count */
  firmware_mbr_set_copy: IpcCommandSpec<{ mbr: unknown; copy: number }, unknown>;

  /** Set MBR version */
  firmware_mbr_set_version: IpcCommandSpec<{ mbr: unknown; version: number }, unknown>;

  /** Set MBR index */
  firmware_mbr_set_index: IpcCommandSpec<{ mbr: unknown; index: number }, unknown>;

  /** Update MBR timestamp */
  firmware_mbr_update_stamp: IpcCommandSpec<{ mbr: unknown }, unknown>;

  /** Serialize MBR to binary */
  firmware_mbr_serialize: IpcCommandSpec<{ mbr: unknown }, number[]>;

  /** Serialize MBR with copies to binary */
  firmware_mbr_serialize_with_copies: IpcCommandSpec<
    { mbr: unknown; copyCount?: number },
    number[]
  >;

  /** Parse boot package (TOC1) binary */
  firmware_parse_boot_package: IpcCommandSpec<
    { data: number[] },
    {
      /** Package name */
      name: string;
      /** Magic number */
      magic: number;
      /** Checksum */
      add_sum: number;
      /** Serial number */
      serial_num: number;
      /** Status field */
      status: number;
      /** Number of items */
      items_nr: number;
      /** Valid length */
      valid_len: number;
      /** Main version */
      version_main: number;
      /** Sub version */
      version_sub: number;
      /** Package items */
      items: Array<{
        /** Item name */
        name: string;
        /** Data offset in package */
        data_offset: number;
        /** Data length */
        data_len: number;
        /** Encryption flag */
        encrypt: number;
        /** Item type code */
        item_type: number;
        /** Run address */
        run_addr: number;
        /** Item index */
        index: number;
      }>;
    }
  >;

  /** Validate boot package */
  firmware_is_valid_boot_package: IpcCommandSpec<{ data: number[] }, boolean>;

  /** Get boot package item data by name */
  firmware_get_boot_package_item_data: IpcCommandSpec<
    { data: number[]; itemName: string },
    number[] | null
  >;

  /** Get boot package item data by index */
  firmware_get_boot_package_item_data_by_index: IpcCommandSpec<
    { data: number[]; index: number },
    number[] | null
  >;

  /** Get item type name from code */
  firmware_get_item_type_name: IpcCommandSpec<{ itemType: number }, string>;

  /** Merge firmware for SPI NOR flash */
  spinor_merge_firmware: IpcCommandSpec<
    { config: unknown },
    { success: boolean; message: string; output_size: number }
  >;

  /** Merge firmware for eMMC/UFS */
  emmc_ufs_merge_firmware: IpcCommandSpec<
    { config: unknown },
    { success: boolean; message: string; output_size: number }
  >;

  // ─── Serial port commands ──────────────────────────────

  /** List available serial ports */
  serial_list_ports: IpcCommandSpec<
    undefined,
    Array<{
      name: string;
      vid: number;
      pid: number;
      manufacturer: string;
      description: string;
      serial_number: string;
    }>
  >;

  /** Open a serial port */
  serial_open: IpcCommandSpec<{
    port: string;
    baudRate: number;
    dataBits: number;
    stopBits: number;
    parity: string;
    flowControl: string;
  }>;

  /** Close a serial port */
  serial_close: IpcCommandSpec<{ port: string }>;

  /** Write data to an open serial port */
  serial_write: IpcCommandSpec<{ port: string; data: number[] }>;

  /** Check if a port is currently open */
  serial_is_open: IpcCommandSpec<{ port: string }, boolean>;

  // ─── TCP commands ──────────────────────────────────

  /** Connect to a TCP server */
  tcp_connect: IpcCommandSpec<{ id: string; host: string; port: number }>;
  /** Send data over an open TCP connection */
  tcp_send: IpcCommandSpec<{ id: string; data: number[] }>;
  /** Start reading from a TCP connection (emits tcp-data-received events) */
  tcp_start_read: IpcCommandSpec<{ id: string }>;
  /** Close a TCP connection */
  tcp_close: IpcCommandSpec<{ id: string }>;

  // ─── CH347 protocol commands ──────────────────────────

  ch347_runtime_info: IpcCommandSpec<
    undefined,
    { available: boolean; path: string | null; error: string | null }
  >;
  ch347_list_devices: IpcCommandSpec<
    undefined,
    Array<{
      index: number;
      name: string;
      chipType?: number;
      chipName?: string;
      desc?: string;
      usbClass?: number;
      funcType?: number;
      chipMode?: number;
      interfaceNumber?: number;
      firmwareVersion?: number;
      product?: string;
      manufacturer?: string;
    }>
  >;
  ch347_open: IpcCommandSpec<{ index: number }>;
  ch347_close: IpcCommandSpec<{ index: number }>;
  ch347_reopen: IpcCommandSpec<{ index: number }>;
  ch347_i2c_transfer: IpcCommandSpec<
    {
      index: number;
      writeData: number[];
      readLen: number;
      speedKhz?: number;
      sclStretch?: boolean;
      delayMs?: number;
    },
    number[]
  >;
  ch347_i2c_scan: IpcCommandSpec<
    { index: number; speedKhz?: number; sclStretch?: boolean; delayMs?: number },
    number[]
  >;
  ch347_spi_init: IpcCommandSpec<{
    index: number;
    mode?: number;
    speedMhz?: number;
    frequencyHz?: number;
    cs?: number;
    dataBits?: number;
    byteOrder?: number;
    writeReadInterval?: number;
    outDefaultData?: number;
    cs1Polarity?: number;
    cs2Polarity?: number;
    isAutoDeactiveCs?: number;
    activeDelay?: number;
    delayDeactive?: number;
  }>;
  ch347_spi_get_config: IpcCommandSpec<
    { index: number },
    {
      mode: number;
      clock: number;
      byteOrder: number;
      writeReadInterval: number;
      outDefaultData: number;
      chipSelect: number;
      cs1Polarity: number;
      cs2Polarity: number;
      isAutoDeactiveCS: number;
      activeDelay: number;
      delayDeactive: number;
    }
  >;
  ch347_spi_set_frequency: IpcCommandSpec<{ index: number; frequencyHz: number }>;
  ch347_spi_set_data_bits: IpcCommandSpec<{ index: number; dataBits: number }>;
  ch347_spi_change_cs: IpcCommandSpec<{ index: number; status: number }>;
  ch347_gpio_get: IpcCommandSpec<{ index: number }, { direction: number; data: number }>;
  ch347_gpio_set: IpcCommandSpec<{
    index: number;
    enable: number;
    dirOut: number;
    dataOut: number;
  }>;
  ch347_spi_set_chip_select: IpcCommandSpec<{
    index: number;
    enableSelect: number;
    chipSelect: number;
    isAutoDeactiveCs: number;
    activeDelay: number;
    delayDeactive: number;
  }>;
  ch347_spi_write: IpcCommandSpec<{
    index: number;
    txData: number[];
    cs?: number;
    mode?: number;
    speedMhz?: number;
    dataBits?: number;
  }>;
  ch347_spi_fill: IpcCommandSpec<{
    index: number;
    color: number[];
    pixelCount: number;
    cs?: number;
  }>;
  ch347_spi_write_buffer: IpcCommandSpec<{
    index: number;
    data: number[];
    cs?: number;
  }>;
  ch347_spi_read: IpcCommandSpec<
    {
      index: number;
      readLen: number;
      cs?: number;
      mode?: number;
      speedMhz?: number;
      dataBits?: number;
    },
    number[]
  >;
  ch347_spi_transfer: IpcCommandSpec<
    {
      index: number;
      txData: number[];
      cs?: number;
      mode?: number;
      speedMhz?: number;
      dataBits?: number;
    },
    number[]
  >;
  ch347_spi_stream4: IpcCommandSpec<
    {
      index: number;
      txData: number[];
      cs?: number;
      mode?: number;
      speedMhz?: number;
      dataBits?: number;
    },
    number[]
  >;

  // ─── Python 产测工具：本地 HTTP 服务启停/状态 ───
  /** 启动内嵌 HTTP REST 服务（默认端口 8765），返回运行状态 */
  pytest_server_start: IpcCommandSpec<{ port?: number }, { running: boolean; port: number | null }>;
  /** 停止内嵌 HTTP REST 服务 */
  pytest_server_stop: IpcCommandSpec<undefined, { running: boolean; port: number | null }>;
  /** 查询内嵌 HTTP REST 服务状态 */
  pytest_server_status: IpcCommandSpec<undefined, { running: boolean; port: number | null }>;

  // ─── Python 产测工具：软件内运行脚本 ───
  /** 查询解析到的 Python 运行时（解释器 / 包目录 / 来源） */
  pytest_runtime_info: IpcCommandSpec<
    undefined,
    { interpreter: string; pythonDir: string; source: string; available: boolean }
  >;
  /** 运行一段 Python 脚本（code 或 path 二选一），输出经事件流式返回 */
  pytest_run_script: IpcCommandSpec<{ code?: string; path?: string }>;
  /** 停止正在运行的脚本 */
  pytest_stop_script: IpcCommandSpec;
  /** 用户工作区目录（可写、持久化、被注入 sys.path），不存在则创建 */
  pytest_user_dir: IpcCommandSpec<undefined, string>;
  pytest_open_user_dir: IpcCommandSpec;
  /** 列出用户目录下的 .py 文件 */
  pytest_list_user_files: IpcCommandSpec<undefined, Array<{ name: string; size: number }>>;
  /** 读取用户目录下的某个 .py 文件 */
  pytest_read_user_file: IpcCommandSpec<{ name: string }, string>;
  /** 把内容写入用户目录下的某个 .py 文件（覆盖） */
  pytest_write_user_file: IpcCommandSpec<{ name: string; content: string }>;

  // ─── AI 聊天（Rust 后端代理调用大模型）───
  /** 流式 AI 聊天：发送消息 + AI 配置（settings 嵌套对象对应后端 AiSettings），AI 回复经 ai-chat-delta 事件流式回传 */
  ai_chat: IpcCommandSpec<{
    messages: Array<{ role: string; content: string }>;
    /** 隔离不同助手实例的流式事件 */
    requestId?: string;
    settings: {
      apiUrl: string;
      apiKey: string;
      model: string;
    };
  }>;
  /** 停止当前流式生成 */
  ai_chat_stop: IpcCommandSpec<{ requestId?: string }>;
  /** 读取用户明确选择的数据手册；支持文本/源码和带文字层的 PDF */
  ai_read_document: IpcCommandSpec<
    { path: string },
    {
      name: string;
      kind: string;
      text: string;
      sizeBytes: number;
      truncated: boolean;
    }
  >;

  // ─── 100ask.net OAuth2 登录 ───
  /** 启动登录：起本机回调服务 + 打开浏览器授权；凭据内置无需参数。登录结果经 auth-login-result 事件回传 */
  auth_login_start: IpcCommandSpec<
    undefined,
    {
      /** 回调服务监听端口 */
      port: number;
      /** 回调地址 */
      redirectUri: string;
      /** 授权地址（打开浏览器的 URL） */
      authorizeUrl: string;
    }
  >;
  /** 查询当前登录用户（未登录返回 null） */
  auth_get_user: IpcCommandSpec<undefined, AuthUserInfo | null>;
  /** 登出，清空会话 */
  auth_logout: IpcCommandSpec;
  /** 取消进行中的登录 */
  auth_cancel_login: IpcCommandSpec;
}

/**
 * 100ask.net 登录用户信息。
 *
 * 由 Rust 后端从 OAuth2 userinfo 接口获取，camelCase 序列化后回传前端。
 */
export interface AuthUserInfo {
  /** 用户 ID */
  id: number;
  /** 用户名 */
  username: string;
  /** 显示名 */
  name: string;
  /** 邮箱 */
  email: string;
  /** 邮箱是否已验证 */
  emailVerified: boolean;
  /** 头像地址 */
  avatarUrl: string;
}

/**
 * Type map for all IPC events.
 *
 * Defines payload types for every Tauri event,
 * enabling type-safe subscription through subscribeEvent.
 * Event names map to IpcEventSpec with typed payload.
 */
export interface IpcEventMap {
  /** AI 聊天：流式增量内容 */
  'ai-chat-delta': IpcEventSpec<{
    /** 发起请求时传入的 ID */
    requestId: string;
    /** 本次增量文本 */
    content: string;
  }>;
  /** AI 聊天：流式结束 */
  'ai-chat-done': IpcEventSpec<{
    /** 发起请求时传入的 ID */
    requestId: string;
    /** 是否被用户中断 */
    aborted: boolean;
  }>;
  /** AI 聊天：出错 */
  'ai-chat-error': IpcEventSpec<{
    /** 发起请求时传入的 ID */
    requestId: string;
    /** 错误信息 */
    error: string;
  }>;
  /** Python 产测脚本运行：一行 stdout/stderr 输出 */
  'pytest-script-output': IpcEventSpec<{
    /** 来源流：stdout 或 stderr */
    stream: 'stdout' | 'stderr';
    /** 该行文本 */
    line: string;
  }>;
  /** Python 产测脚本运行结束 */
  'pytest-script-exit': IpcEventSpec<{
    /** 进程退出码（-1 表示异常） */
    code: number;
    /** 是否成功（code === 0） */
    success: boolean;
  }>;
  /** USB hot-plug event for device connection/disconnection */
  'usb-hotplug': IpcEventSpec<{
    /** Event type: arrived or left */
    event: 'arrived' | 'left';
    /** USB vendor ID */
    vendorId: number;
    /** USB product ID */
    productId: number;
    /** EFEX device ID if FEL/FES device */
    efexDeviceId: number | null;
    /** USB bus ID */
    busId: number;
    /** USB device ID */
    usbDeviceId: number;
    /** Device path string */
    devicePath: string | null;
    /** USB port number */
    port: number | null;
  }>;

  /** Firmware packer log event */
  'packer-log': IpcEventSpec<{ level: string; message: string }>;

  /** Firmware packer progress event */
  'packer-progress': IpcEventSpec<{
    /** Current stage name */
    stage: string;
    /** Current item count */
    current: number;
    /** Total item count */
    total: number;
    /** Status message */
    message: string;
  }>;

  /** Flash operation progress event */
  'flash-progress': IpcEventSpec<{
    /** Task ID */
    taskId: number;
    /** Stage identifier */
    stageId: string;
    /** Stage display label */
    stageLabel: string;
    /** Stage completion percentage */
    stagePercent: number;
    /** Overall completion percentage */
    overallPercent: number;
    /** Current partition name */
    currentPartition?: string;
    /** Completed partition names */
    completedPartitions: string[];
    /** Partition completion percentage */
    partitionPercent?: number;
    /** Bytes written */
    writtenBytes?: number;
    /** Total bytes to write */
    totalBytes?: number;
    /** Whether progress is indeterminate */
    indeterminate: boolean;
  }>;

  /** Flash operation log event */
  'flash-log': IpcEventSpec<{
    /** Task ID */
    taskId: number;
    /** Log level */
    level: string;
    /** Log message */
    message: string;
    /** Timestamp */
    timestamp: number;
  }>;

  /** Flash operation state change event */
  'flash-state': IpcEventSpec<{
    /** Task ID */
    taskId: number;
    /** New status */
    status: 'started' | 'completed' | 'failed' | 'cancelled';
    /** Status message */
    message?: string;
    /** Error details if failed */
    error?: { code: number; name: string; message: string };
  }>;

  /** Flash popup request event */
  'flash-popup': IpcEventSpec<{
    /** Task ID */
    taskId: number;
    /** Popup type */
    popupType: string;
    /** Popup title */
    title: string;
    /** Popup message */
    message: string;
  }>;

  /** Flash confirmation request event */
  'flash-confirm-request': IpcEventSpec<{
    /** Task ID */
    taskId: number;
    /** Request ID for response */
    requestId: number;
    /** Confirmation kind */
    kind: string;
    /** Confirmation title */
    title: string;
    /** Confirmation message */
    message: string;
  }>;

  /** DRAM initialization info event */
  'flash-dram-info': IpcEventSpec<{
    /** Task ID */
    taskId: number;
    /** Return address */
    retAddr: number;
    /** DRAM init flag */
    dramInitFlag: number;
    /** DRAM update flag */
    dramUpdateFlag: number;
    /** DRAM parameters */
    dramPara: number[];
  }>;

  /** Mass production slot update event */
  'mass-slot-update': IpcEventSpec<{
    /** Slot ID */
    slotId: number;
    /** Slot status */
    status: 'idle' | 'waiting' | 'flashing' | 'success' | 'failed';
    /** Progress percentage */
    progress: number;
    /** Current stage */
    stage: string;
    /** Flash speed */
    speed: string | null;
    /** Error message */
    error: string | null;
    /** USB bus */
    bus: number | null;
    /** USB port */
    port: number | null;
    /** Start time */
    startTime: number | null;
    /** End time */
    endTime: number | null;
  }>;

  /** Mass production log event */
  'mass-log': IpcEventSpec<{
    /** Slot ID or null for general */
    slotId: number | null;
    /** Log level */
    level: string;
    /** Log message */
    message: string;
    /** Timestamp */
    timestamp: number;
  }>;

  /** Mass production state event */
  'mass-state': IpcEventSpec<{
    /** Current state */
    state: 'stopped' | 'running';
    /** Total count */
    total: number;
    /** Success count */
    success: number;
    /** Failed count */
    failed: number;
    /** In progress count */
    inProgress: number;
  }>;

  /** Serial port data received event */
  'serial-data-received': IpcEventSpec<{
    port: string;
    data: number[];
  }>;

  /** TCP data received event */
  'tcp-data-received': IpcEventSpec<{
    id: string;
    data: number[];
  }>;

  /** TCP disconnected event */
  'tcp-disconnected': IpcEventSpec<string>;

  /** 100ask.net 登录结果事件（auth_login_start 后异步回传） */
  'auth-login-result': IpcEventSpec<{
    /** 是否登录成功 */
    success: boolean;
    /** 登录成功时的用户信息 */
    user: AuthUserInfo | null;
    /** 登录失败时的错误信息 */
    error: string | null;
  }>;
}

/** Extract argument type for a command */
export type CommandArgs<K extends keyof IpcCommandMap> = IpcCommandMap[K]['args'];

/** Extract result type for a command */
export type CommandResult<K extends keyof IpcCommandMap> = IpcCommandMap[K]['result'];

/** Extract payload type for an event */
export type EventPayload<K extends keyof IpcEventMap> = IpcEventMap[K]['payload'];
