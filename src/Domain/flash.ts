/**
 * Flash operation mode type.
 *
 * Defines the different flashing strategies available:
 * - bootloader: Flash bootloader components only
 * - partition: Flash selected partitions only
 * - keep_data: Flash without erasing user data partitions
 * - partition_erase: Erase selected partitions before flashing
 * - full_erase: Full flash erase before writing
 * - erase_only: Erase flash without writing
 */
export type FlashMode =
  | 'bootloader'
  | 'partition'
  | 'keep_data'
  | 'partition_erase'
  | 'full_erase'
  | 'erase_only';

/**
 * Post-flash action type.
 *
 * Defines the action to take after flashing completes:
 * - reboot: Reboot the device
 * - poweroff: Power off the device
 * - none: Leave device in current state
 */
export type PostFlashAction = 'reboot' | 'poweroff' | 'none';

/**
 * Post-flash action options for UI selection.
 *
 * Array of value/label pairs for post-flash action dropdowns,
 * with labels referencing i18n translation keys.
 */
export const POST_FLASH_ACTION_OPTIONS: { value: PostFlashAction; label: string }[] = [
  { value: 'reboot', label: 'postFlashAction.reboot' },
  { value: 'poweroff', label: 'postFlashAction.shutdown' },
  { value: 'none', label: 'postFlashAction.none' },
];