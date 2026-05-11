/** 写入任务 last_error / result 时的截断上限，集中管理便于单测断言 */
export const EXEC_OUTPUT_CAP = 3000;
export const VERIFY_ERROR_CAP = 3000;
export const AI_REVIEW_ERROR_CAP = 3000;
export const AI_REVIEW_FIX_PROMPT_APPEND_CAP = 4000;
export const AI_REVIEW_RESULT_SNIPPET_CAP = 2000;

/** {git_diff} 占位符采集上限（字符数），超出截断并追加 `[... truncated ...]` 标记 */
export const GIT_DIFF_CAP = 100_000;
/** {git_diff_name_status} 占位符采集上限（字符数） */
export const GIT_DIFF_NAME_STATUS_CAP = 50_000;
