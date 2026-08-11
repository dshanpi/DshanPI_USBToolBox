import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleCheck, faRightFromBracket, faUser } from '@fortawesome/free-solid-svg-icons';
import type { AuthUserInfo } from '../../Platform/IPC/Commands';
import './UserProfileDialog.css';

/**
 * 用户信息弹窗 props。
 */
interface UserProfileDialogProps {
  /** 是否显示 */
  visible: boolean;
  /** 当前登录用户信息（未登录时不渲染） */
  user: AuthUserInfo | null;
  /** 关闭弹窗回调 */
  onClose: () => void;
  /** 退出登录回调（点击底部「退出登录」时触发） */
  onLogout: () => void;
}

/**
 * 用户信息弹窗。
 *
 * 点击侧边栏用户名按钮后弹出，展示当前登录用户的 100ask.net 账号信息
 * （头像、显示名、用户名、邮箱及验证状态、用户 ID），底部提供「退出登录」按钮。
 *
 * 视觉风格复用 Popup 组件的遮罩层 + slideIn 动画与主题色变量，保持一致。
 * 点击遮罩或右上角关闭按钮可关闭弹窗；退出登录后会先关闭弹窗再执行登出。
 *
 * Example usage:
 * ```tsx
 * <UserProfileDialog
 *   visible={profileVisible}
 *   user={authUser}
 *   onClose={() => setProfileVisible(false)}
 *   onLogout={() => { setProfileVisible(false); authService.logout(); }}
 * />
 * ```
 */
export const UserProfileDialog: React.FC<UserProfileDialogProps> = ({
  visible,
  user,
  onClose,
  onLogout,
}) => {
  const { t } = useTranslation();

  if (!visible || !user) return null;

  return (
    <div className="user-profile-overlay" onClick={onClose}>
      <motion.div
        className="user-profile-card"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.95, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -10 }}
        transition={{ duration: 0.15 }}
      >
        {/* 关闭按钮 */}
        <button className="user-profile-close" onClick={onClose} aria-label={t('common.close')}>
          ✕
        </button>

        {/* 头部：头像 + 显示名 + 用户名 */}
        <div className="user-profile-header">
          <div className="user-profile-avatar">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.name} />
            ) : (
              <FontAwesomeIcon icon={faUser} />
            )}
          </div>
          <div className="user-profile-names">
            <div className="user-profile-name">{user.name}</div>
            <div className="user-profile-username">@{user.username}</div>
          </div>
        </div>

        {/* 详细信息列表 */}
        <div className="user-profile-body">
          <div className="user-profile-field">
            <span className="user-profile-field-label">{t('userProfile.email')}</span>
            <span className="user-profile-field-value">
              {user.email}
              {user.emailVerified && (
                <FontAwesomeIcon
                  icon={faCircleCheck}
                  className="user-profile-verified"
                  title={t('userProfile.emailVerified')}
                />
              )}
            </span>
          </div>
          <div className="user-profile-field">
            <span className="user-profile-field-label">{t('userProfile.userId')}</span>
            <span className="user-profile-field-value">{user.id}</span>
          </div>
        </div>

        {/* 底部：退出登录 */}
        <div className="user-profile-footer">
          <motion.button
            className="user-profile-logout-btn"
            onClick={onLogout}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={{ duration: 0.1 }}
          >
            <FontAwesomeIcon icon={faRightFromBracket} />
            <span>{t('userProfile.logout')}</span>
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
};

export default UserProfileDialog;
