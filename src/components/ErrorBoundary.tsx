import { Component, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { hasError: true, message: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: unknown): void {
    console.error('应用渲染错误', error);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#f4efe4', color: '#26301f' }}>
          <div style={{ maxWidth: 680, background: '#fffdf7', border: '1px solid #ddd2bb', borderRadius: 18, padding: 24, boxShadow: '0 14px 38px rgba(70,55,28,.12)' }}>
            <h1 style={{ marginTop: 0 }}>竹编设计系统遇到渲染错误</h1>
            <p style={{ color: '#6f7564', lineHeight: 1.7 }}>
              数据仍保存在 IndexedDB，不会因为此提示丢失。可尝试刷新页面；如果是在反复切换三维预览后出现，通常与浏览器 WebGL 上下文数量有关。
            </p>
            <pre style={{ whiteSpace: 'pre-wrap', background: '#f8f1e3', padding: 12, borderRadius: 10, fontSize: 12 }}>{this.state.message}</pre>
            <button className="btn primary" onClick={() => window.location.reload()}>刷新页面</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
