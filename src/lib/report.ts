import type { ConversationMessage, Report } from './ai/provider';

export type ReportSource = 'mock' | 'real';
export type ScoredReport = Report & { scoringSource?: ReportSource; scoringModel?: string };

export function reportSource(report: { scores?: unknown; scoringSource?: unknown }): ReportSource | null {
  if (!report.scores) return null;
  return report.scoringSource === 'real' ? 'real' : 'mock';
}

export const reportSourceLabels = { mock: 'Mock 演示评分', real: '真实 AI 评分' } as const;

export function reportEvidenceMatches(issues: Report['issues'], history: ConversationMessage[]): boolean {
  return issues.every(({ message_id, quote }) => Boolean(quote.trim()) &&
    history.some(message => message.id === message_id && message.role === 'user' && message.content.includes(quote)));
}
