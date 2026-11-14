import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** UI-ийн аль нэг хэсэг унавал бүх апп цагаан дэлгэц болохгүй */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[web] UI алдаа:', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
          <span className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-3 text-rose-200">
            <AlertTriangle className="size-6" />
          </span>
          <h1 className="text-lg font-semibold">Уучлаарай, алдаа гарлаа</h1>
          <p className="max-w-md text-sm text-muted-foreground">{this.state.error.message}</p>
          <div className="mt-2 flex gap-2">
            <Button variant="secondary" onClick={() => this.setState({ error: null })}>
              Дахин оролдох
            </Button>
            <Button
              onClick={() => {
                window.location.href = '/';
              }}
            >
              Эхлэл рүү
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
