import { invokeCommand } from '../Platform/IPC';

/** Installation state for the two Windows driver packages bundled with USBToolBox. */
export interface DriverStatus {
  supported: boolean;
  installed: boolean;
  serialDriverInstalled: boolean;
  interfaceDriverInstalled: boolean;
  friendlyNameHelperInstalled: boolean;
  publishedNames: string[];
}

/** Result returned after an elevated install or uninstall operation. */
export interface DriverOperationResult {
  success: boolean;
  cancelled: boolean;
  restartRequired: boolean;
  warnings: string[];
  status: DriverStatus;
}

export class DriverService {
  getStatus(): Promise<DriverStatus> {
    return invokeCommand('driver_get_status');
  }

  install(): Promise<DriverOperationResult> {
    return invokeCommand('driver_install');
  }

  uninstall(): Promise<DriverOperationResult> {
    return invokeCommand('driver_uninstall');
  }
}

export const driverService = new DriverService();
