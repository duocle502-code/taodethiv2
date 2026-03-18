import { useEffect, useRef } from 'react';

interface MathMarkdownProps {
  content: string;
  className?: string;
}

/**
 * Token-based approach:
 * 1. Trích xuất và bảo vệ tất cả nội dung đặc biệt (math, SVG, code) khỏi bị escape/markdown xử lý
 * 2. Xử lý Markdown trên phần còn lại
 * 3. Khôi phục nội dung đặc biệt
 */

let tokenCounter = 0;
const TOKEN_PREFIX = '\u0000TK_';

interface TokenEntry {
  token: string;
  html: string;
}

function createToken(): string {
  return `${TOKEN_PREFIX}${tokenCounter++}\u0000`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function markdownToHtml(md: string): string {
  if (!md) return '';

  const tokens: TokenEntry[] = [];
  let html = md;

  // Helper: thay thế nội dung bằng token và lưu HTML tương ứng
  const protect = (outputHtml: string): string => {
    const token = createToken();
    tokens.push({ token, html: outputHtml });
    return token;
  };

  // ===== BƯỚC 1: Trích xuất tất cả nội dung đặc biệt =====

  // 1a. Block math: $$...$$
  html = html.replace(/\$\$([\s\S]*?)\$\$/g, (_, expr) => {
    return protect(`<div class="math-block my-3 text-center overflow-x-auto text-lg">$$${expr}$$</div>`);
  });

  // 1b. Block math: \[...\]
  html = html.replace(/\\\[([\s\S]*?)\\\]/g, (_, expr) => {
    return protect(`<div class="math-block my-3 text-center overflow-x-auto text-lg">\\[${expr}\\]</div>`);
  });

  // 1c. Inline math: \(...\)
  html = html.replace(/\\\((.+?)\\\)/g, (_, expr) => {
    return protect(`\\(${expr}\\)`);
  });

  // 1d. Inline math: $...$ (single line, không bắt $$)
  html = html.replace(/\$([^\$\n]+?)\$/g, (_, expr) => {
    return protect(`\\(${expr}\\)`);
  });

  // 2a. SVG trong code block: ```svg\n...\n```
  html = html.replace(/```svg[\s]*\n([\s\S]*?)```/g, (_, svgContent) => {
    return protect(`<div class="my-5 flex justify-center"><div class="svg-figure" style="background:#fff; border:2px solid #e2e8f0; border-radius:16px; padding:20px 24px; display:inline-block; box-shadow:0 2px 8px rgba(0,0,0,0.06);">${svgContent.trim()}</div></div>`);
  });

  // 2b. SVG raw: <svg...>...</svg> (AI có thể không bọc trong code block)
  html = html.replace(/<svg[\s\S]*?<\/svg>/gi, (match) => {
    return protect(`<div class="my-5 flex justify-center"><div class="svg-figure" style="background:#fff; border:2px solid #e2e8f0; border-radius:16px; padding:20px 24px; display:inline-block; box-shadow:0 2px 8px rgba(0,0,0,0.06);">${match}</div></div>`);
  });

  // 3. Code blocks: ```lang\n...\n```
  html = html.replace(/```(\w*)\s*\n([\s\S]*?)```/g, (_, _lang, code) => {
    return protect(`<pre class="bg-gray-900 text-gray-100 p-4 rounded-xl my-3 overflow-x-auto text-sm font-mono leading-relaxed"><code>${escapeHtml(code.trim())}</code></pre>`);
  });

  // ===== BƯỚC 2: Escape HTML (an toàn vì nội dung đặc biệt đã được bảo vệ) =====
  html = escapeHtml(html);

  // ===== BƯỚC 3: Parse Markdown =====

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-lg font-bold text-gray-800 mt-5 mb-2">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold text-gray-900 mt-6 mb-3 pb-2 border-b border-gray-200">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold text-gray-900 mt-4 mb-3">$1</h1>');

  // Bold & Italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="bg-gray-100 text-red-500 px-1.5 py-0.5 rounded text-sm font-mono">$1</code>');

  // Horizontal rule
  html = html.replace(/^---+$/gm, '<hr class="my-4 border-gray-200" />');

  // Lists
  html = html.replace(/^[\-\*] (.+)$/gm, '<li class="ml-4 list-disc">$1</li>');
  html = html.replace(/^\d+\.\s(.+)$/gm, '<li class="ml-4 list-decimal">$1</li>');
  html = html.replace(/((?:<li class="ml-4 list-disc">.*<\/li>\n?)+)/g, '<ul class="my-2 space-y-1">$1</ul>');
  html = html.replace(/((?:<li class="ml-4 list-decimal">.*<\/li>\n?)+)/g, '<ol class="my-2 space-y-1">$1</ol>');

  // Paragraphs
  const blocks = html.split(/\n{2,}/);
  html = blocks.map(block => {
    const trimmed = block.trim();
    if (!trimmed) return '';
    // Không wrap nếu là HTML block element
    if (/^<(h[1-6]|div|ul|ol|li|hr|pre|blockquote|table)/i.test(trimmed)) {
      return trimmed;
    }
    // Không wrap nếu là token (sẽ được thay thế sau)
    if (trimmed.startsWith(TOKEN_PREFIX) || trimmed.includes(TOKEN_PREFIX)) {
      return trimmed;
    }
    return `<p class="my-2 leading-relaxed">${trimmed.replace(/\n/g, '<br />')}</p>`;
  }).join('\n');

  // ===== BƯỚC 4: Khôi phục tất cả tokens =====
  // Khôi phục từ cuối lên đầu để tránh xung đột (nested tokens)
  for (let i = tokens.length - 1; i >= 0; i--) {
    html = html.replaceAll(tokens[i].token, tokens[i].html);
  }

  return html;
}

export const MathMarkdown: React.FC<MathMarkdownProps> = ({ content, className }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Gọi MathJax sau khi DOM render
  useEffect(() => {
    if (!containerRef.current || !content) return;

    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;

    const renderMath = () => {
      const mj = (window as any).MathJax;
      if (mj && typeof mj.typesetPromise === 'function' && containerRef.current) {
        try {
          mj.typesetClear([containerRef.current]);
          mj.typesetPromise([containerRef.current]).catch((err: any) => {
            console.warn('MathJax typeset warning:', err);
          });
        } catch (e) {
          console.error('MathJax error:', e);
        }
      } else {
        attempts++;
        if (attempts < 50) {
          timer = setTimeout(renderMath, 200);
        }
      }
    };

    timer = setTimeout(renderMath, 50);
    return () => clearTimeout(timer);
  }, [content]);

  const htmlContent = markdownToHtml(content || '');

  return (
    <div
      ref={containerRef}
      className={className}
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
};
