import type {
  BeforeAfter,
  CaseStudy,
  FlowStage,
  GuideSection,
  Problem,
  Product,
  Script,
} from '@/lib/types';

export interface ReviewDimension {
  name: string;
  value: number | null;
  note: string;
}

export interface FlaggedMessage {
  text: string;
  issues: [string, string][];
}

export interface ReviewRecommendation {
  text: string;
  source: string;
}

export interface ReviewResult {
  overall: number;
  dims: ReviewDimension[];
  good: string[];
  improve: string[];
  flagged: FlaggedMessage[];
  rec: ReviewRecommendation | null;
  adminCount: number;
  provider: string;
}

export interface AssistantField {
  label: string;
  value: string;
  productIds?: string[];
  table?: string;
}

export type AssistantSection =
  | { kind: 'text'; title?: string; text: string }
  | { kind: 'product-list'; title?: string; products: Product[] }
  | { kind: 'product-detail'; product: Product; fields: AssistantField[] }
  | {
      kind: 'comparison';
      title?: string;
      products: Product[];
      rows: { label: string; values: string[] }[];
    }
  | { kind: 'scripts'; title?: string; items: Script[] }
  | { kind: 'cases'; title?: string; items: CaseStudy[] }
  | { kind: 'before-after'; title?: string; items: BeforeAfter[] }
  | { kind: 'problem'; item: Problem }
  | { kind: 'guide'; item: GuideSection }
  | { kind: 'flow'; item: FlowStage };

export interface AssistantAnswer {
  sections: AssistantSection[];
  source?: string;
  note?: string;
}
