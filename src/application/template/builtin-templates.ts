/**
 * 内置任务模板 — 编译到代码中的 5 个开箱模板
 */
import type { TaskTemplate } from "./template-resolver.js";

export const BUILTIN_TEMPLATES: TaskTemplate[] = [
  {
    id: "fix-bug",
    label: "修复 Bug",
    description: "分析并修复指定文件中的 bug",
    task_type: "code_gen",
    mode: "execute",
    prompt_template:
      "请分析 {file} 中的 bug 并修复。\n\n错误现象：{symptom}\n\n要求：\n1. 定位根因而非表面症状\n2. 修复后确认相关测试通过\n3. 不引入新 lint 警告",
    required_fields: ["file", "symptom"],
    optional_fields: ["test_file"],
    acceptance_template:
      "1. 原 bug 不再复现\n2. 现有测试通过\n3. `npm run check` 零错误",
  },
  {
    id: "add-test",
    label: "补测试",
    description: "为指定源文件补充单元测试",
    task_type: "test_gen",
    mode: "execute",
    prompt_template:
      "为 {file} 编写单元测试。\n\n要求：\n1. 覆盖主要逻辑分支和边界条件\n2. 使用项目已有测试框架（vitest）\n3. 测试文件放在对应 test/ 目录下\n4. 所有测试通过",
    required_fields: ["file"],
    optional_fields: ["focus"],
    acceptance_template: "1. 新增测试全部通过\n2. 覆盖率达到合理水平\n3. 无 lint 错误",
  },
  {
    id: "refactor",
    label: "重构函数",
    description: "重构指定函数，保持行为不变",
    task_type: "refactor",
    mode: "execute",
    prompt_template:
      "重构 {file} 中的 {function} 函数。\n\n目标：{goal}\n\n约束：\n1. 保持外部行为完全不变\n2. 改进可读性和可维护性\n3. 所有现有测试必须继续通过\n4. 不改变公共 API 签名",
    required_fields: ["file", "function", "goal"],
    optional_fields: [],
    acceptance_template:
      "1. 现有测试全部通过\n2. 代码可读性明显改善\n3. 无功能回归\n4. `npm run check` 零错误",
  },
  {
    id: "code-review",
    label: "代码审查",
    description: "对指定文件进行 AI 代码审查",
    task_type: "code_review",
    mode: "execute",
    prompt_template:
      "请审查 {file} 的代码质量，关注以下方面：\n{focus}\n\n输出格式：\n1. 严重问题（bugs / 安全漏洞）\n2. 性能问题\n3. 可维护性问题\n4. 改进建议",
    required_fields: ["file"],
    optional_fields: ["focus"],
    acceptance_template:
      "1. 审查结果覆盖安全、性能、可维护性三个维度\n2. 每个发现包含文件路径和行号\n3. 改进建议具体可操作",
  },
  {
    id: "add-feature",
    label: "添加功能",
    description: "按照规格添加新功能",
    task_type: "code_gen",
    mode: "execute",
    prompt_template:
      "在 {file} 中实现以下功能：\n\n{spec}\n\n要求：\n1. 遵循项目现有代码风格\n2. 添加必要的类型定义\n3. 编写或更新测试\n4. 不破坏现有功能",
    required_fields: ["file", "spec"],
    optional_fields: ["test_file"],
    acceptance_template:
      "1. 新功能按规格工作\n2. 测试通过\n3. 类型检查通过\n4. 无回归",
  },
];
