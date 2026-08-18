/// <reference types="vite/client" />

declare module '*.css' {
  const content: { [className: string]: string };
  export default content;
}

declare module '*?worker' {
  const workerConstructor: {
    new (): Worker;
  };
  export default workerConstructor;
}

// Vite asset URL imports — covers TTF/OTF/WOFF/etc. with the ?url suffix.
// Used by src/Components/SPITool/lib/ssd1306Font.ts to import the TTF font as a URL.
declare module '*?url' {
  const url: string;
  export default url;
}
