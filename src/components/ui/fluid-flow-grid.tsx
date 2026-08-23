import React, { useEffect, useRef } from "react";

export interface FluidFlowGridProps {
  /** Pass the page's own dark-mode state — this reads real theme colors,
   *  it doesn't detect OS preference itself. */
  isDark: boolean;
  /** Brief gold flash across the grid, e.g. on a successful login. */
  isSuccess?: boolean;
  /** Additional container CSS classes */
  className?: string;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "").trim();
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const num = parseInt(full || "000000", 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

/**
 * FluidFlowGrid
 *
 * A quiet, textural background: a grid of short line segments that drift in a
 * turbulent flow field and bend away from the cursor. Deliberately kept low-
 * contrast (thin lines, low alpha) so it reads as ambient texture behind real
 * content rather than competing with it. Colors are read live from this
 * app's own CSS custom properties (--muted-foreground / --brand-red /
 * --brand-gold) instead of a hardcoded palette, so it always matches
 * whatever the current theme actually is.
 */
export function FluidFlowGrid({ isDark, isSuccess = false, className = "" }: FluidFlowGridProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const successRef = useRef(0);

  useEffect(() => {
    if (isSuccess) successRef.current = 1;
  }, [isSuccess]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let animationFrameId: number;
    let width = 0;
    let height = 0;
    const mouse = { x: -1000, y: -1000, targetX: -1000, targetY: -1000 };

    const root = getComputedStyle(document.documentElement);
    const readVar = (name: string, fallback: string) => root.getPropertyValue(name).trim() || fallback;
    const baseRgb = hexToRgb(readVar("--muted-foreground", isDark ? "#8C8778" : "#6B6659"));
    const accentRgb = hexToRgb(readVar("--brand-red", isDark ? "#FF5468" : "#C81E3A"));
    const goldRgb = hexToRgb(readVar("--brand-gold", isDark ? "#E8B84B" : "#A9791C"));

    const handleResize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      // This canvas is `position: fixed`, so it only ever shows a
      // viewport-sized window regardless of page length -- size the pixel
      // buffer to the viewport, NOT canvas.parentElement.clientHeight (the
      // wrapper's full in-flow content height, e.g. 3800px+ on a long page).
      // Sizing to the parent was allocating/redrawing 4x more canvas than
      // ever gets shown, for nothing.
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.targetX = e.clientX - rect.left;
      mouse.targetY = e.clientY - rect.top;
    };
    const handleMouseLeave = () => {
      mouse.targetX = -1000;
      mouse.targetY = -1000;
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    window.addEventListener("mouseleave", handleMouseLeave);

    let time = 0;

    const render = () => {
      time += 0.006;
      mouse.x += (mouse.targetX - mouse.x) * 0.08;
      mouse.y += (mouse.targetY - mouse.y) * 0.08;
      successRef.current = Math.max(0, successRef.current - 0.015);
      const flash = successRef.current;

      // Transparent clear, not a fillRect — this sits *under* real page
      // content, it shouldn't paint its own opaque background.
      ctx.clearRect(0, 0, width, height);

      const spacing = 42;
      const cols = Math.ceil(width / spacing) + 1;
      const rows = Math.ceil(height / spacing) + 1;
      ctx.lineWidth = 1.4;

      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const x = i * spacing;
          const y = j * spacing;

          let angle = Math.sin(x * 0.003 + time) + Math.cos(y * 0.003 + time);

          const dx = mouse.x - x;
          const dy = mouse.y - y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          let isNear = false;
          if (dist < 180 && dist > 0) {
            isNear = true;
            const pushAngle = Math.atan2(dy, dx) + Math.PI;
            const force = 1 - dist / 180;
            angle = angle * (1 - force) + pushAngle * force;
          }

          const lineLen = isNear ? 26 : 17;
          const x2 = x + Math.cos(angle) * lineLen;
          const y2 = y + Math.sin(angle) * lineLen;

          // Composited against a near-white page background, low alpha here
          // reads as literally invisible, not "subtle" -- confirmed via a
          // headless-browser pixel probe (max observed alpha ~0.17 produced
          // a <30/255 RGB delta from #FAFAF8, imperceptible at a glance).
          // These values are deliberately much higher so the texture actually
          // registers as ambient motion instead of doing nothing.
          const baseAlpha = 0.22 + Math.sin(x * 0.01 + y * 0.01 + time) * 0.08;
          const alpha = Math.min(0.85, isNear ? 0.55 + flash * 0.25 : baseAlpha + flash * 0.2);
          const rgb = isNear ? accentRgb : flash > 0.05 ? goldRgb : baseRgb;

          ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [isDark]);

  return (
    <canvas
      ref={canvasRef}
      // Deliberately NOT z-index:-10. `position:fixed` always creates its
      // own stacking context regardless of z-index (per spec), so a
      // negative value here doesn't just sit "behind normal content" the
      // way it would on a plain relative/absolute box -- verified via a
      // headless pixel probe that it was never compositing into the page
      // AT ALL, at any alpha. z-index:0 (the default) + being the first
      // child in the DOM is enough: later siblings (nav, hero, sections)
      // still paint above it in normal tree order.
      className={`fixed inset-0 pointer-events-none w-full h-full ${className}`}
      style={{ display: "block" }}
    />
  );
}

export default FluidFlowGrid;
