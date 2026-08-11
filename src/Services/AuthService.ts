import { invokeCommand, subscribeEvent } from '../Platform/IPC/Client';
import type { UnlistenFn } from '@tauri-apps/api/event';
import type { AuthUserInfo } from '../Platform/IPC/Commands';

export type { AuthUserInfo };

/**
 * 登录结果回调。
 *
 * @param success - 是否登录成功
 * @param user - 登录成功时的用户信息（失败为 null）
 * @param error - 登录失败时的错误信息（成功为 null）
 */
export type AuthResultCallback = (
  success: boolean,
  user: AuthUserInfo | null,
  error: string | null
) => void;

/**
 * Service for 100ask.net OAuth2 login.
 *
 * AuthService 封装 100ask.net OAuth2 Authorization Code 登录流程的 Tauri 命令调用：
 * - `login()` 启动登录（后端起本机回调服务并打开浏览器），登录结果异步通过
 *   `auth-login-result` 事件回传，调用方需先 `onLoginResult` 注册回调。
 * - `getUser()` 查询当前登录用户（未登录返回 null）。
 * - `logout()` 登出，`cancelLogin()` 取消进行中的登录。
 *
 * 后端在收到 100ask.net 回跳后自动换 token、取用户信息、存会话并 emit 结果事件；
 * access_token 留在后端不外泄，前端只持有展示用的 {@link AuthUserInfo}。
 *
 * Example usage:
 * ```typescript
 * authService.onLoginResult((success, user, error) => {
 *   if (success && user) setCurrentUser(user);
 * });
 * await authService.login();
 * ```
 */
export class AuthService {
  /** 当前登录用户（内存缓存，与后端会话保持一致）。 */
  private currentUser: AuthUserInfo | null = null;

  /** auth-login-result 事件订阅句柄。 */
  private unlisten: UnlistenFn | null = null;

  /** 已注册的结果回调集合。 */
  private callbacks = new Set<AuthResultCallback>();

  /**
   * 注册登录结果回调。
   *
   * 内部只订阅一次 `auth-login-result` 事件，多个回调共享同一订阅。
   * 返回取消注册函数。
   *
   * @param callback - 登录结果回调
   */
  async onLoginResult(callback: AuthResultCallback): Promise<() => void> {
    this.callbacks.add(callback);
    // 首次注册时订阅事件。
    if (!this.unlisten) {
      this.unlisten = await subscribeEvent('auth-login-result', (payload) => {
        if (payload.success && payload.user) {
          this.currentUser = payload.user;
        }
        for (const cb of this.callbacks) {
          try {
            cb(payload.success, payload.user, payload.error);
          } catch (e) {
            console.error('auth result callback error:', e);
          }
        }
      });
    }
    return () => {
      this.callbacks.delete(callback);
    };
  }

  /**
   * 启动登录。
   *
   * OAuth 凭据已内置在后端，无需任何参数。后端起本机回调服务并打开浏览器；
   * 命令本身立即返回，登录结果经 `auth-login-result` 事件回传
   * （需先 {@link onLoginResult} 注册回调）。
   *
   * @returns 后端回调服务端口与授权地址等信息
   */
  async login(): Promise<{ port: number; redirectUri: string; authorizeUrl: string }> {
    return invokeCommand('auth_login_start');
  }

  /**
   * 查询当前登录用户。
   *
   * 优先返回内存缓存，未缓存时向后端查询并缓存。
   *
   * @returns 当前登录用户，未登录返回 null
   */
  async getUser(): Promise<AuthUserInfo | null> {
    if (this.currentUser) {
      return this.currentUser;
    }
    const user = await invokeCommand('auth_get_user');
    this.currentUser = user;
    return user;
  }

  /**
   * 登出，清空后端会话与本地缓存。
   */
  async logout(): Promise<void> {
    await invokeCommand('auth_logout');
    this.currentUser = null;
  }

  /**
   * 取消进行中的登录（关停后端回调服务）。
   */
  async cancelLogin(): Promise<void> {
    await invokeCommand('auth_cancel_login');
  }

  /**
   * 销毁：取消事件订阅。通常在组件卸载时调用。
   */
  destroy(): void {
    if (this.unlisten) {
      this.unlisten();
      this.unlisten = null;
    }
    this.callbacks.clear();
  }
}

/** Singleton instance of AuthService */
export const authService = new AuthService();
