use super::*;

impl<R: Runtime> ProgressReporter<R> {
    pub(super) fn new(app_handle: AppHandle<R>, task_id: u64, stages: Vec<StageDef>) -> Self {
        Self {
            app_handle,
            task_id,
            stages,
            current_index: 0,
            stage_percent: 0.0,
            current_partition: None,
            completed_partitions: Vec::new(),
            partition_percent: None,
            written_bytes: None,
            total_bytes: None,
            indeterminate: false,
        }
    }

    pub(super) fn start(&mut self, stage_id: &'static str) {
        if let Some(index) = self.stages.iter().position(|stage| stage.id == stage_id) {
            self.current_index = index;
        }
        self.stage_percent = 0.0;
        self.emit();
    }

    pub(super) fn update(&mut self, stage_percent: f64, stage_label: Option<&str>) {
        self.stage_percent = stage_percent.clamp(0.0, 100.0);
        self.emit_with_label(stage_label);
    }

    pub(super) fn complete(&mut self) {
        self.stage_percent = 100.0;
        self.emit();
    }

    pub(super) fn set_current_partition(&mut self, partition: Option<String>) {
        self.current_partition = partition;
    }

    pub(super) fn mark_completed_partition(&mut self, partition: &str) {
        if !self
            .completed_partitions
            .iter()
            .any(|item| item == partition)
        {
            self.completed_partitions.push(partition.to_string());
        }
    }

    pub(super) fn set_partition_progress(
        &mut self,
        partition_percent: Option<f64>,
        written_bytes: Option<u64>,
        total_bytes: Option<u64>,
    ) {
        self.partition_percent = partition_percent;
        self.written_bytes = written_bytes;
        self.total_bytes = total_bytes;
    }

    pub(super) fn set_indeterminate(&mut self, indeterminate: bool) {
        self.indeterminate = indeterminate;
        self.emit();
    }

    pub(super) fn emit(&self) {
        self.emit_with_label(None);
    }

    pub(super) fn download_context(&self) -> DownloadProgressContext<R> {
        self.download_context_for_transfer(0, None)
    }

    pub(super) fn download_context_for_transfer(
        &self,
        transfer_base_bytes: u64,
        transfer_total_bytes: Option<u64>,
    ) -> DownloadProgressContext<R> {
        let current_stage = self
            .stages
            .get(self.current_index)
            .copied()
            .unwrap_or(StageDef {
                id: "unknown",
                label: "Unknown",
                weight: 1,
            });

        let completed_weight: u32 = self
            .stages
            .iter()
            .take(self.current_index)
            .map(|stage| stage.weight)
            .sum();
        let total_weight: u32 = self.stages.iter().map(|stage| stage.weight).sum();

        DownloadProgressContext {
            app_handle: self.app_handle.clone(),
            task_id: self.task_id,
            stage_id: current_stage.id.to_string(),
            stage_label: current_stage.label.to_string(),
            completed_weight,
            stage_weight: current_stage.weight,
            total_weight,
            transfer_base_bytes,
            transfer_total_bytes,
            current_partition: self.current_partition.clone(),
            completed_partitions: self.completed_partitions.clone(),
        }
    }

    fn emit_with_label(&self, stage_label: Option<&str>) {
        let current_stage = self
            .stages
            .get(self.current_index)
            .copied()
            .unwrap_or(StageDef {
                id: "unknown",
                label: "Unknown",
                weight: 1,
            });

        let completed_weight: u32 = self
            .stages
            .iter()
            .take(self.current_index)
            .map(|stage| stage.weight)
            .sum();
        let total_weight: u32 = self.stages.iter().map(|stage| stage.weight).sum();
        let current_weight = current_stage.weight as f64 * (self.stage_percent / 100.0);
        let overall_percent = if total_weight == 0 {
            self.stage_percent
        } else {
            ((completed_weight as f64 + current_weight) / total_weight as f64) * 100.0
        };

        let _ = self.app_handle.emit(
            EVENT_FLASH_PROGRESS,
            FlashProgressEvent {
                task_id: self.task_id,
                stage_id: current_stage.id.to_string(),
                stage_label: stage_label.unwrap_or(current_stage.label).to_string(),
                stage_percent: self.stage_percent,
                overall_percent,
                current_partition: self.current_partition.clone(),
                completed_partitions: self.completed_partitions.clone(),
                partition_percent: self.partition_percent,
                written_bytes: self.written_bytes,
                total_bytes: self.total_bytes,
                indeterminate: self.indeterminate,
            },
        );
    }
}

pub(super) fn emit_download_progress<R: Runtime>(
    context: &DownloadProgressContext<R>,
    stage_label: &str,
    partition_name: &str,
    bytes_written: u64,
    total_bytes: u64,
) {
    emit_download_progress_range(
        context,
        stage_label,
        partition_name,
        bytes_written,
        total_bytes,
        0.0,
        100.0,
    );
}

pub(super) fn emit_download_progress_range<R: Runtime>(
    context: &DownloadProgressContext<R>,
    stage_label: &str,
    partition_name: &str,
    bytes_written: u64,
    total_bytes: u64,
    stage_start_percent: f64,
    stage_end_percent: f64,
) {
    let raw_percent = if total_bytes == 0 {
        0.0
    } else {
        (bytes_written as f64 / total_bytes as f64) * 100.0
    }
    .clamp(0.0, 100.0);

    let effective_written = context.transfer_base_bytes.saturating_add(bytes_written);
    let effective_total = context.transfer_total_bytes.unwrap_or(total_bytes);
    let stage_progress_raw = if effective_total == 0 {
        0.0
    } else {
        (effective_written as f64 / effective_total as f64) * 100.0
    }
    .clamp(0.0, 100.0);

    let stage_percent = stage_start_percent
        + ((stage_end_percent - stage_start_percent) * (stage_progress_raw / 100.0));

    let overall_percent = if context.total_weight == 0 {
        stage_percent
    } else {
        ((context.completed_weight as f64 + context.stage_weight as f64 * (stage_percent / 100.0))
            / context.total_weight as f64)
            * 100.0
    };

    let _ = context.app_handle.emit(
        EVENT_FLASH_PROGRESS,
        FlashProgressEvent {
            task_id: context.task_id,
            stage_id: context.stage_id.clone(),
            stage_label: stage_label.to_string(),
            stage_percent,
            overall_percent,
            current_partition: Some(partition_name.to_string()),
            completed_partitions: context.completed_partitions.clone(),
            partition_percent: Some(raw_percent),
            written_bytes: Some(effective_written),
            total_bytes: Some(effective_total),
            indeterminate: false,
        },
    );
}

pub(super) fn pick_run_stages(start_mode: &str, erase_only: bool) -> Vec<StageDef> {
    let mut stages = vec![
        StageDef {
            id: "load_image",
            label: "Loading firmware image",
            weight: 3,
        },
        StageDef {
            id: "open_device",
            label: "Opening device",
            weight: 2,
        },
    ];

    if start_mode == "fel" {
        stages.extend([
            StageDef {
                id: "fel_prepare",
                label: "Preparing FES payload",
                weight: 2,
            },
            StageDef {
                id: "fel_init_dram",
                label: "Initializing DRAM",
                weight: 20,
            },
            StageDef {
                id: "fel_download_uboot",
                label: "Downloading U-Boot",
                weight: 12,
            },
            StageDef {
                id: "fel_reconnect",
                label: "Waiting for SRV mode",
                weight: 10,
            },
            StageDef {
                id: "fel_ready",
                label: "Preparing flash session",
                weight: 2,
            },
        ]);
    }

    stages.extend([
        StageDef {
            id: "query_secure",
            label: "Querying boot mode",
            weight: 2,
        },
        StageDef {
            id: "erase_flag",
            label: "Sending erase flag",
            weight: 3,
        },
        StageDef {
            id: "query_storage",
            label: "Querying storage information",
            weight: 2,
        },
        StageDef {
            id: "mbr",
            label: "Downloading MBR (erase flash if needed)",
            weight: 5,
        },
    ]);

    if !erase_only {
        stages.push(StageDef {
            id: "partitions",
            label: "Downloading partitions",
            weight: 80,
        });
        stages.push(StageDef {
            id: "boot",
            label: "Downloading boot components",
            weight: 5,
        });
    }

    stages.extend([
        StageDef {
            id: "set_mode",
            label: "Setting post-flash action",
            weight: 2,
        },
        StageDef {
            id: "complete",
            label: "Completing flash",
            weight: 1,
        },
    ]);

    stages
}
