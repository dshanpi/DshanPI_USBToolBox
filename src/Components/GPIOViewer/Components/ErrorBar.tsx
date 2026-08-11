import React from 'react';

interface ErrorBarProps {
  error: string | null;
  onDismiss: () => void;
}

export const ErrorBar: React.FC<ErrorBarProps> = ({ error, onDismiss }) => {
  if (!error) return null;

  return (
    <div className="gpio-error-bar">
      <span>{error}</span>
      <button onClick={onDismiss}>✕</button>
    </div>
  );
};
