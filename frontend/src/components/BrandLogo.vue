<template>
  <!--
    BrandLogo — 站点品牌标识
    寓意：一本打开的书（知识库）中央生长出一片叶子（环境监测）
    配色：叶 青绿渐变 #00E6A0→#06B6D4；书 科技蓝渐变 #60A5FA→#2563EB
  -->
  <svg class="brand-svg" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient id="brand-leaf" x1="20" y1="4" x2="20" y2="25" gradientUnits="userSpaceOnUse">
        <stop stop-color="#00E6A0" />
        <stop offset="1" stop-color="#06B6D4" />
      </linearGradient>
      <linearGradient id="brand-book" x1="7" y1="26" x2="33" y2="37" gradientUnits="userSpaceOnUse">
        <stop stop-color="#60A5FA" />
        <stop offset="1" stop-color="#2563EB" />
      </linearGradient>
    </defs>

    <!-- 叶片（环境） -->
    <path
      d="M20 4C26 8 29 15 27 22C25 24.5 22 25 20 25C18 25 15 24.5 13 22C11 15 14 8 20 4Z"
      fill="url(#brand-leaf)"
    />
    <!-- 主叶脉 -->
    <path d="M20 7.5V21.5" stroke="white" stroke-opacity="0.9" stroke-width="1.5" stroke-linecap="round" />
    <!-- 侧叶脉 -->
    <path
      d="M20 12L16.5 9.5M20 16L23.5 13.5"
      stroke="white" stroke-opacity="0.55" stroke-width="1" stroke-linecap="round"
    />

    <!-- 打开的书本（知识库） -->
    <path d="M6.5 28C11 25.6 16.5 25.9 20 28.6V37C16.5 34.5 11 34.2 6.5 36.2Z" fill="url(#brand-book)" />
    <path d="M33.5 28C29 25.6 23.5 25.9 20 28.6V37C23.5 34.5 29 34.2 33.5 36.2Z" fill="url(#brand-book)" />
  </svg>
</template>

<style scoped>
.brand-svg {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
