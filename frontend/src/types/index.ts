/** 产品小吴知识库 — 类型定义 */

export interface UserOut {
  id: number;
  username: string;
  email: string | null;
  nickname: string;
  avatar: string;
  phone: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
}

export interface CategoryOut {
  id: number;
  module: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  sort_order: number;
  is_active: boolean;
}

export interface ArticleOut {
  id: number;
  title: string;
  content: string;
  summary: string;
  cover_image: string;
  module: string;
  category_id: number | null;
  category_name: string | null;
  tags: string[];
  status: string;
  is_pinned: boolean;
  is_public: boolean;
  view_count: number;
  like_count: number;
  author_id: number;
  author_name: string;
  created_at: string;
  updated_at: string;
}

export interface ArticleListOut {
  id: number;
  title: string;
  summary: string;
  cover_image: string;
  module: string;
  category_id: number | null;
  category_name: string | null;
  tags: string[];
  status: string;
  is_pinned: boolean;
  view_count: number;
  like_count: number;
  author_name: string;
  created_at: string;
}

export interface VideoOut {
  id: number;
  title: string;
  description: string;
  cover_image: string;
  video_url: string;
  video_type: string;
  category_id: number | null;
  category_name: string | null;
  tags: string[];
  duration: string;
  is_public: boolean;
  view_count: number;
  author_name: string;
  created_at: string;
}

export interface StandardOut {
  id: number;
  title: string;
  description: string;
  cover_image: string;
  std_type: string;
  category_id: number | null;
  category_name: string | null;
  tags: string[];
  file_url: string;
  is_public: boolean;
  view_count: number;
  download_count: number;
  author_name: string;
  created_at: string;
}

export interface FAQOut {
  id: number;
  question: string;
  answer: string;
  faq_type: string;
  category_id: number | null;
  category_name: string | null;
  tags: string[];
  is_pinned: boolean;
  is_public: boolean;
  view_count: number;
  author_name: string;
  created_at: string;
}

export interface ToolOut {
  id: number;
  name: string;
  slug: string;
  description: string;
  icon: string;
  tool_type: string;
  category: string;
  config: Record<string, unknown>;
  is_public: boolean;
  sort_order: number;
  created_at: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface CommentOut {
  id: number;
  content: string;
  article_id: number;
  author_id: number;
  author_name: string;
  parent_id: number | null;
  created_at: string;
}
