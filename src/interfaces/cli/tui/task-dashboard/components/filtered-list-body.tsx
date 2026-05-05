import type { ReactNode } from "react";
import { EmptyHint } from "./empty-hint.js";

export type FilteredListBodyProps = {
  searchQuery: string;
  filteredLen: number;
  visibleLen: number;
  emptyDefault: string;
  children: ReactNode;
};

/** 搜索无结果 / 视口异常 / 有数据时渲染列表 */
export function FilteredListBody({
  searchQuery,
  filteredLen,
  visibleLen,
  emptyDefault,
  children,
}: FilteredListBodyProps) {
  if (filteredLen === 0) {
    return <EmptyHint>{searchQuery.trim() ? "无匹配任务" : emptyDefault}</EmptyHint>;
  }
  if (visibleLen === 0) {
    return <EmptyHint>滚动范围异常</EmptyHint>;
  }
  return children;
}
