import { Copy } from "lucide-react";
import { isValidElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { Button } from "./ui/button";

function textFromNode(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(textFromNode).join("");
  }
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return textFromNode(node.props.children);
  }
  return "";
}

export function MessageMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        a: ({ children: linkChildren, ...props }) => (
          <a target="_blank" rel="noreferrer noopener" {...props}>
            {linkChildren}
          </a>
        ),
        pre: ({ children: codeChildren }) => (
          <div className="group/code relative my-3 overflow-hidden rounded-xl border border-border bg-code">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute right-2 top-2 z-10 opacity-0 transition-opacity group-hover/code:opacity-100 focus-visible:opacity-100"
              aria-label="Copy code"
              onClick={() =>
                void navigator.clipboard.writeText(textFromNode(codeChildren))
              }
            >
              <Copy />
            </Button>
            <pre className="overflow-x-auto p-4 text-xs">{codeChildren}</pre>
          </div>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
