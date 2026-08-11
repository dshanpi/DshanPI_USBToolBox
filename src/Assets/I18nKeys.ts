import i18n from '../i18n';

// 动态翻译键, 用于在运行时根据语言环境动态翻译文本,不会使用只是提供导出的键

export const DYNAMIC_I18N_KEYS = {
  flashMode: {
    bootloader: i18n.t('flashMode.bootloader', { defaultValue: '启动加载器模式' }),
    partition: i18n.t('flashMode.partition', { defaultValue: '分区模式' }),
    keep_data: i18n.t('flashMode.keep_data', { defaultValue: '保留数据模式' }),
    partition_erase: i18n.t('flashMode.partition_erase', { defaultValue: '分区擦除模式' }),
    full_erase: i18n.t('flashMode.full_erase', { defaultValue: '全片擦除模式' }),
    erase_only: i18n.t('flashMode.erase_only', { defaultValue: '仅擦除模式' }),
  },
  postFlashAction: {
    reboot: i18n.t('postFlashAction.reboot', { defaultValue: '重启' }),
    shutdown: i18n.t('postFlashAction.shutdown', { defaultValue: '关机' }),
    none: i18n.t('postFlashAction.none', { defaultValue: '无操作' }),
  },
  imageData: {
    fes: i18n.t('imageData.fes', { defaultValue: 'FES' }),
    uboot: i18n.t('imageData.uboot', { defaultValue: 'U-Boot' }),
    uboot_crash: i18n.t('imageData.uboot_crash', { defaultValue: 'U-Boot 崩溃日志' }),
    mbr: i18n.t('imageData.mbr', { defaultValue: 'MBR' }),
    gpt: i18n.t('imageData.gpt', { defaultValue: 'GPT' }),
    sys_config: i18n.t('imageData.sys_config', { defaultValue: '系统配置' }),
    sys_config_bin: i18n.t('imageData.sys_config_bin', { defaultValue: '系统配置 bin' }),
    sys_partition: i18n.t('imageData.sys_partition', { defaultValue: '系统分区' }),
    board_config: i18n.t('imageData.board_config', { defaultValue: '板级配置' }),
    dtb: i18n.t('imageData.dtb', { defaultValue: 'DTB' }),
    boot0_card: i18n.t('imageData.boot0_card', { defaultValue: 'Boot0 卡启动' }),
    boot0_nor: i18n.t('imageData.boot0_nor', { defaultValue: 'Boot0 NOR 启动' }),
    bootpkg: i18n.t('imageData.bootpkg', { defaultValue: 'Boot 包' }),
    bootpkg_nor: i18n.t('imageData.bootpkg_nor', { defaultValue: 'Boot 包 NOR' }),
    pc_plugin: i18n.t('imageData.pc_plugin', { defaultValue: 'PC 插件' }),
    card_plugin: i18n.t('imageData.card_plugin', { defaultValue: '卡插件' }),
    card_script: i18n.t('imageData.card_script', { defaultValue: '卡脚本' }),
  },
  flashManagerStages: {
    complete: i18n.t('flashManager.stages.complete', { defaultValue: '完成' }),
    downloadBoot: i18n.t('flashManager.stages.downloadBoot', { defaultValue: '下载启动' }),
    downloadUboot: i18n.t('flashManager.stages.downloadUboot', { defaultValue: '下载 U-Boot' }),
    fesFlash: i18n.t('flashManager.stages.fesFlash', { defaultValue: 'FES 烧录' }),
    flashMbr: i18n.t('flashManager.stages.flashMbr', { defaultValue: '烧录 MBR' }),
    flashPartitions: i18n.t('flashManager.stages.flashPartitions', { defaultValue: '烧录分区' }),
    initDram: i18n.t('flashManager.stages.initDram', { defaultValue: '初始化 DRAM' }),
    loadImage: i18n.t('flashManager.stages.loadImage', { defaultValue: '加载镜像' }),
    openDevice: i18n.t('flashManager.stages.openDevice', { defaultValue: '打开设备' }),
    prepareFes: i18n.t('flashManager.stages.prepareFes', { defaultValue: '准备 FES' }),
    prepareFlash: i18n.t('flashManager.stages.prepareFlash', { defaultValue: '准备烧录' }),
    queryBootMode: i18n.t('flashManager.stages.queryBootMode', { defaultValue: '查询启动模式' }),
    queryStorageInfo: i18n.t('flashManager.stages.queryStorageInfo', {
      defaultValue: '查询存储信息',
    }),
    sendEraseFlag: i18n.t('flashManager.stages.sendEraseFlag', { defaultValue: '发送擦除标志' }),
    setDeviceMode: i18n.t('flashManager.stages.setDeviceMode', { defaultValue: '设置设备模式' }),
    waitReconnect: i18n.t('flashManager.stages.waitReconnect', { defaultValue: '等待重连' }),
  },
  themes: {
    light: i18n.t('themes.light', { defaultValue: '浅色' }),
    dark: i18n.t('themes.dark', { defaultValue: '深色' }),
    system: i18n.t('themes.system', { defaultValue: '跟随系统' }),
  },
  massProduction: {
    statusLabels: {
      idle: i18n.t('massProduction.statusLabels.idle', { defaultValue: '空闲' }),
      waiting: i18n.t('massProduction.statusLabels.waiting', { defaultValue: '等待中' }),
      flashing: i18n.t('massProduction.statusLabels.flashing', { defaultValue: '烧录中' }),
      success: i18n.t('massProduction.statusLabels.success', { defaultValue: '完成' }),
      failed: i18n.t('massProduction.statusLabels.failed', { defaultValue: '失败' }),
    },
  },
  firmwarePackerTools: {
    spinor_converter: {
      name: i18n.t('firmwarePacker.toolsList.spinor_converter.name', {
        defaultValue: 'SPI NOR 固件转换',
      }),
      desc: i18n.t('firmwarePacker.toolsList.spinor_converter.desc', {
        defaultValue: '将固件转换为 SPI NOR 烧录器格式',
      }),
    },
    emmc_converter: {
      name: i18n.t('firmwarePacker.toolsList.emmc_converter.name', {
        defaultValue: 'eMMC 固件转换',
      }),
      desc: i18n.t('firmwarePacker.toolsList.emmc_converter.desc', {
        defaultValue: '将固件转换为 eMMC 烧录器格式',
      }),
    },
    sdnand_converter: {
      name: i18n.t('firmwarePacker.toolsList.sdnand_converter.name', {
        defaultValue: 'SD Nand 固件转换',
      }),
      desc: i18n.t('firmwarePacker.toolsList.sdnand_converter.desc', {
        defaultValue: '将固件转换为 SDNand 烧录器格式',
      }),
    },
    sdcard_converter: {
      name: i18n.t('firmwarePacker.toolsList.sdcard_converter.name', {
        defaultValue: 'SD Card 固件转换',
      }),
      desc: i18n.t('firmwarePacker.toolsList.sdcard_converter.desc', {
        defaultValue: '将固件转换为 SDCard 烧录器格式',
      }),
    },
    ufs_converter: {
      name: i18n.t('firmwarePacker.toolsList.ufs_converter.name', { defaultValue: 'UFS 固件转换' }),
      desc: i18n.t('firmwarePacker.toolsList.ufs_converter.desc', {
        defaultValue: '将固件转换为 UFS 烧录器格式',
      }),
    },
  },
  firmwarePackerEmmcufs: {
    title: i18n.t('firmwarePacker.emmcufs.title', { defaultValue: 'eMMC 转换' }),
    selectFirmware: i18n.t('firmwarePacker.emmcufs.selectFirmware', {
      defaultValue: '选择固件文件',
    }),
    firmwareSelected: i18n.t('firmwarePacker.emmcufs.firmwareSelected', {
      defaultValue: '已选择固件: {{path}}',
    }),
    loadFailed: i18n.t('firmwarePacker.emmcufs.loadFailed', { defaultValue: '加载固件失败' }),
    loadError: i18n.t('firmwarePacker.emmcufs.loadError', { defaultValue: '加载错误' }),
    encrypted: i18n.t('firmwarePacker.emmcufs.encrypted', { defaultValue: '固件已加密，不支持' }),
    loadSuccess: i18n.t('firmwarePacker.emmcufs.loadSuccess', {
      defaultValue: '固件加载成功，文件数: {{count}}',
    }),
    partitionsFound: i18n.t('firmwarePacker.emmcufs.partitionsFound', {
      defaultValue: '发现 {{count}} 个分区',
    }),
    noPartitions: i18n.t('firmwarePacker.emmcufs.noPartitions', { defaultValue: '未找到分区表' }),
    autoLogicOffset: i18n.t('firmwarePacker.emmcufs.autoLogicOffset', {
      defaultValue: '自动检测 logic_offset: {{value}} 扇区',
    }),
    noFlashMap: i18n.t('firmwarePacker.emmcufs.noFlashMap', {
      defaultValue: '未找到 flash_map 配置，使用默认值',
    }),
    noFirmware: i18n.t('firmwarePacker.emmcufs.noFirmware', { defaultValue: '请先选择固件文件' }),
    starting: i18n.t('firmwarePacker.emmcufs.starting', { defaultValue: '开始转换...' }),
    outputPath: i18n.t('firmwarePacker.emmcufs.outputPath', { defaultValue: '输出文件: {{path}}' }),
    config: i18n.t('firmwarePacker.emmcufs.config', {
      defaultValue: 'logic_offset={{offset}} 扇区, flash_type={{type}}',
    }),
    convertSuccess: i18n.t('firmwarePacker.emmcufs.convertSuccess', {
      defaultValue: '转换成功: {{size}}',
    }),
    success: i18n.t('firmwarePacker.emmcufs.success', { defaultValue: '转换成功' }),
    convertFailed: i18n.t('firmwarePacker.emmcufs.convertFailed', {
      defaultValue: '转换失败: {{error}}',
    }),
    error: i18n.t('firmwarePacker.emmcufs.error', { defaultValue: '转换失败' }),
    convertError: i18n.t('firmwarePacker.emmcufs.convertError', {
      defaultValue: '转换错误: {{error}}',
    }),
    firmwareFile: i18n.t('firmwarePacker.emmcufs.firmwareFile', { defaultValue: '固件文件' }),
    selectFirmwarePlaceholder: i18n.t('firmwarePacker.emmcufs.selectFirmwarePlaceholder', {
      defaultValue: '选择 .img 固件文件...',
    }),
    flashType: i18n.t('firmwarePacker.emmcufs.flashType', { defaultValue: '存储类型' }),
    logicOffset: i18n.t('firmwarePacker.emmcufs.logicOffset', {
      defaultValue: 'Logic Offset (扇区)',
    }),
    autoDetected: i18n.t('firmwarePacker.emmcufs.autoDetected', { defaultValue: '自动检测' }),
    converting: i18n.t('firmwarePacker.emmcufs.converting', { defaultValue: '转换中...' }),
    convert: i18n.t('firmwarePacker.emmcufs.convert', { defaultValue: '开始转换' }),
    partitions: i18n.t('firmwarePacker.emmcufs.partitions', {
      defaultValue: '分区列表 ({{count}})',
    }),
    secureFirmware: i18n.t('firmwarePacker.emmcufs.secureFirmware', {
      defaultValue: '检测到安全固件，将使用 TOC0/TOC1',
    }),
    normalFirmware: i18n.t('firmwarePacker.emmcufs.normalFirmware', {
      defaultValue: '检测到普通固件，将使用 Boot0/U-Boot',
    }),
    firmwareType: i18n.t('firmwarePacker.emmcufs.firmwareType', { defaultValue: '固件类型' }),
    secureType: i18n.t('firmwarePacker.emmcufs.secureType', {
      defaultValue: '安全固件 (TOC0/TOC1)',
    }),
    normalType: i18n.t('firmwarePacker.emmcufs.normalType', {
      defaultValue: '普通固件 (Boot0/U-Boot)',
    }),
  },
};
