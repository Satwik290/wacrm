"use client"

import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  type ReactFlowProps,
  type Node,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

interface CanvasWrapperProps extends Omit<ReactFlowProps, "children"> {
  minimapNodeColor?: (node: Node) => string
}

export function CanvasWrapper({ minimapNodeColor, ...props }: CanvasWrapperProps) {
  return (
    <ReactFlow
      fitView
      fitViewOptions={{ padding: 0.22, maxZoom: 1 }}
      proOptions={{ hideAttribution: true }}
      onlyRenderVisibleElements
      panOnScroll
      zoomOnScroll
      minZoom={0.15}
      maxZoom={2}
      {...props}
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={20}
        size={1.2}
        color="var(--border)"
      />
      <Controls
        showInteractive={false}
        className="!overflow-hidden !rounded-xl !border !border-[var(--border)] !bg-[var(--card)] !shadow-[0_6px_20px_-8px_rgba(0,0,0,0.5)] [&_button]:!border-[var(--border)] [&_button]:!bg-[var(--card)] [&_button:hover]:!bg-[var(--muted)] [&_button_svg]:!fill-[var(--foreground)]"
      />
      <MiniMap
        pannable
        zoomable
        nodeColor={minimapNodeColor || "var(--border)"}
        nodeStrokeWidth={0}
        nodeBorderRadius={4}
        maskColor="color-mix(in oklch, var(--background) 70%, transparent)"
        className="!rounded-xl !border !border-[var(--border)] !bg-[var(--card)] !shadow-[0_6px_20px_-8px_rgba(0,0,0,0.5)]"
      />
    </ReactFlow>
  )
}
