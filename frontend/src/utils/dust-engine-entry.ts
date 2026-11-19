/**
 * dust-engine-entry.ts — 跨端引擎统一出口（仅供构建脚本使用）
 *
 * 平台端与小程序端共用同一套烟尘计算逻辑：
 *   - flue-dust-sampling.ts：主引擎 + 纯函数原语（全压↔静压、干湿基口径）
 *   - flue-dust-modes.ts：9 个分项计算模式注册表
 *
 * 该文件不参与平台前端打包，只作为 scripts/build-dust-engine.mjs 的 bundle 入口。
 */
export * from "./flue-dust-sampling";
export * from "./flue-dust-modes";
