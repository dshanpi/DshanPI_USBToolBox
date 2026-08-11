import { useState, useCallback, useRef } from 'react';
import { adbService, type AdbServerStatus } from '../../../Services';

export function useAdbServer() {
  const [serverStatus, setServerStatus] = useState<AdbServerStatus | null>(null);
  const checkingRef = useRef(false);

  const checkServerStatus = useCallback(async () => {
    if (checkingRef.current) {
      return false;
    }
    checkingRef.current = true;

    try {
      const status = await adbService.checkServer();
      setServerStatus(status);
      return status.running;
    } catch {
      return false;
    } finally {
      checkingRef.current = false;
    }
  }, []);

  return { serverStatus, checkServerStatus };
}
