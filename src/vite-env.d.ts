/// <reference types="vite/client" />

// <model-viewer> 웹 컴포넌트 (src/components/Model3D.tsx에서 필요할 때만 불러온다)
declare namespace JSX {
  interface IntrinsicElements {
    'model-viewer': import('react').DetailedHTMLProps<import('react').HTMLAttributes<HTMLElement>, HTMLElement> & Record<string, unknown>
  }
}
