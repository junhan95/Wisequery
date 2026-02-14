import type { ChunkAttributes } from "@shared/schema";

// Filter types compatible with OpenAI Vector Store API
export type ComparisonOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin';
export type LogicalOperator = 'and' | 'or';

export interface ComparisonFilter {
  type: ComparisonOperator;
  key: string;
  value: string | number | boolean | (string | number)[];
}

export interface CompoundFilter {
  type: LogicalOperator;
  filters: AttributeFilter[];
}

export type AttributeFilter = ComparisonFilter | CompoundFilter;

function isCompoundFilter(filter: AttributeFilter): filter is CompoundFilter {
  return filter.type === 'and' || filter.type === 'or';
}

function evaluateComparison(filter: ComparisonFilter, attributes: ChunkAttributes): boolean {
  const attrValue = attributes[filter.key];
  
  // Handle undefined attribute
  if (attrValue === undefined) {
    // 'ne' returns true for missing values, others return false
    return filter.type === 'ne';
  }

  switch (filter.type) {
    case 'eq':
      return attrValue === filter.value;
    
    case 'ne':
      return attrValue !== filter.value;
    
    case 'gt':
      if (typeof attrValue === 'number' && typeof filter.value === 'number') {
        return attrValue > filter.value;
      }
      return false;
    
    case 'gte':
      if (typeof attrValue === 'number' && typeof filter.value === 'number') {
        return attrValue >= filter.value;
      }
      return false;
    
    case 'lt':
      if (typeof attrValue === 'number' && typeof filter.value === 'number') {
        return attrValue < filter.value;
      }
      return false;
    
    case 'lte':
      if (typeof attrValue === 'number' && typeof filter.value === 'number') {
        return attrValue <= filter.value;
      }
      return false;
    
    case 'in':
      if (Array.isArray(filter.value)) {
        return filter.value.includes(attrValue as string | number);
      }
      return false;
    
    case 'nin':
      if (Array.isArray(filter.value)) {
        return !filter.value.includes(attrValue as string | number);
      }
      return true;
    
    default:
      return false;
  }
}

export function evaluateFilter(filter: AttributeFilter, attributes: ChunkAttributes): boolean {
  if (isCompoundFilter(filter)) {
    if (filter.type === 'and') {
      return filter.filters.every(f => evaluateFilter(f, attributes));
    } else {
      return filter.filters.some(f => evaluateFilter(f, attributes));
    }
  } else {
    return evaluateComparison(filter, attributes);
  }
}

export function filterChunksByAttributes<T extends { attributes?: ChunkAttributes | null }>(
  chunks: T[],
  filter: AttributeFilter | null | undefined
): T[] {
  if (!filter) {
    return chunks;
  }
  
  return chunks.filter(chunk => {
    if (!chunk.attributes) {
      return false;
    }
    return evaluateFilter(filter, chunk.attributes);
  });
}

// Validate filter structure
export function validateFilter(filter: unknown): filter is AttributeFilter {
  if (!filter || typeof filter !== 'object') {
    return false;
  }
  
  const f = filter as Record<string, unknown>;
  
  if (!f.type || typeof f.type !== 'string') {
    return false;
  }
  
  // Check compound filter
  if (f.type === 'and' || f.type === 'or') {
    if (!Array.isArray(f.filters)) {
      return false;
    }
    return f.filters.every(validateFilter);
  }
  
  // Check comparison filter
  const validOps: ComparisonOperator[] = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'nin'];
  if (!validOps.includes(f.type as ComparisonOperator)) {
    return false;
  }
  
  if (typeof f.key !== 'string') {
    return false;
  }
  
  // Value validation
  if (f.type === 'in' || f.type === 'nin') {
    if (!Array.isArray(f.value)) {
      return false;
    }
  } else {
    if (f.value === undefined || f.value === null) {
      return false;
    }
  }
  
  return true;
}

// Convenience filter builders
export const Filters = {
  eq: (key: string, value: string | number | boolean): ComparisonFilter => ({
    type: 'eq', key, value
  }),
  
  ne: (key: string, value: string | number | boolean): ComparisonFilter => ({
    type: 'ne', key, value
  }),
  
  gt: (key: string, value: number): ComparisonFilter => ({
    type: 'gt', key, value
  }),
  
  gte: (key: string, value: number): ComparisonFilter => ({
    type: 'gte', key, value
  }),
  
  lt: (key: string, value: number): ComparisonFilter => ({
    type: 'lt', key, value
  }),
  
  lte: (key: string, value: number): ComparisonFilter => ({
    type: 'lte', key, value
  }),
  
  in: (key: string, values: (string | number)[]): ComparisonFilter => ({
    type: 'in', key, value: values
  }),
  
  nin: (key: string, values: (string | number)[]): ComparisonFilter => ({
    type: 'nin', key, value: values
  }),
  
  and: (...filters: AttributeFilter[]): CompoundFilter => ({
    type: 'and', filters
  }),
  
  or: (...filters: AttributeFilter[]): CompoundFilter => ({
    type: 'or', filters
  }),
  
  // Common filter shortcuts
  byProject: (projectId: string): ComparisonFilter => ({
    type: 'eq', key: 'projectId', value: projectId
  }),
  
  byFileType: (fileTypes: string[]): ComparisonFilter => ({
    type: 'in', key: 'fileType', value: fileTypes
  }),
  
  byDateRange: (startTimestamp: number, endTimestamp: number): CompoundFilter => ({
    type: 'and',
    filters: [
      { type: 'gte', key: 'uploadedAt', value: startTimestamp },
      { type: 'lte', key: 'uploadedAt', value: endTimestamp }
    ]
  }),
  
  byFolder: (folderId: string): ComparisonFilter => ({
    type: 'eq', key: 'folderId', value: folderId
  }),
};
