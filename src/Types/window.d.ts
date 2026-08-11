declare global {
  interface Window {
    __confirmCancelHandler?: () => void;
  }

  interface Navigator {
    userLanguage?: string;
  }
}

export {};
