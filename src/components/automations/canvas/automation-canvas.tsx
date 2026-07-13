"use client"

/**
 * AutomationCanvas
 *
 * Visual read-only canvas view of an automation's step tree.
 * Accepts the same BuilderStep[] the list builder uses so no context
 * wiring is needed — the parent just passes state.steps.
 */

import { useMemo } from "react"
import {
  Handle,
  Position,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react"

import { CanvasWrapper } from "@/components/canvas-shared/canvas-wrapper"
import { NodeChip } from "@/components/canvas-shared/node-chip"
import { MessageSquare, MousePointerClick, List, FileText, Tag, TagIcon, UserCheck, PencilLine, Briefcase, Hourglass, GitBranch, Webhook, CircleSlash, Zap } from "lucide-react"

import type { AutomationStepType } from "@/types"
import type { BuilderStep } from "../automation-builder"

// Color palette
const STEP_COLORS: Record<AutomationStepType, { solid: string; soft: string; text: string }> = {
  send_message:         { solid: "oklch(0.6 0.18 293)",  soft: "oklch(0.6 0.18 293 / 0.14)",  text: "oklch(0.72 0.16 293)"  },
  send_buttons:         { solid: "oklch(0.62 0.16 254)", soft: "oklch(0.62 0.16 254 / 0.14)", text: "oklch(0.74 0.14 254)"  },
  send_list:            { solid: "oklch(0.62 0.15 277)", soft: "oklch(0.62 0.15 277 / 0.14)", text: "oklch(0.74 0.13 277)"  },
  send_template:        { solid: "oklch(0.65 0.15 210)", soft: "oklch(0.65 0.15 210 / 0.14)", text: "oklch(0.76 0.13 210)"  },
  send_webhook:         { solid: "oklch(0.65 0.15 230)", soft: "oklch(0.65 0.15 230 / 0.14)", text: "oklch(0.76 0.13 230)"  },
  add_tag:              { solid: "oklch(0.65 0.15 350)", soft: "oklch(0.65 0.15 350 / 0.14)", text: "oklch(0.76 0.13 350)"  },
  remove_tag:           { solid: "oklch(0.65 0.12 16)",  soft: "oklch(0.65 0.12 16 / 0.14)",  text: "oklch(0.76 0.1 16)"    },
  update_contact_field: { solid: "oklch(0.65 0.1 185)",  soft: "oklch(0.65 0.1 185 / 0.14)",  text: "oklch(0.76 0.09 185)" },
  create_deal:          { solid: "oklch(0.65 0.14 65)",  soft: "oklch(0.65 0.14 65 / 0.14)",  text: "oklch(0.76 0.12 65)"  },
  assign_conversation:  { solid: "oklch(0.65 0.17 16)",  soft: "oklch(0.65 0.17 16 / 0.14)",  text: "oklch(0.76 0.15 16)"  },
  wait:                 { solid: "oklch(0.72 0.1 65)",   soft: "oklch(0.72 0.1 65 / 0.14)",   text: "oklch(0.82 0.09 65)"  },
  condition:            { solid: "oklch(0.72 0.15 65)",  soft: "oklch(0.72 0.15 65 / 0.14)",  text: "oklch(0.82 0.13 65)"  },
  close_conversation:   { solid: "oklch(0.65 0.1 0)",    soft: "oklch(0.65 0.1 0 / 0.14)",    text: "oklch(0.76 0.09 0)"   },
}

const STEP_LABELS: Record<AutomationStepType, string> = {
  send_message:         "Send Message",
  send_buttons:         "Send Buttons",
  send_list:            "Send List",
  send_template:        "Send Template",
  send_webhook:         "Webhook",
  add_tag:              "Add Tag",
  remove_tag:           "Remove Tag",
  update_contact_field: "Update Field",
  create_deal:          "Create Deal",
  assign_conversation:  "Assign",
  wait:                 "Wait",
  condition:            "Condition",
  close_conversation:   "Close",
}

const STEP_ICONS: Record<AutomationStepType, React.ElementType> = {
  send_message: MessageSquare,
  send_buttons: MousePointerClick,
  send_list: List,
  send_template: FileText,
  add_tag: Tag,
  remove_tag: TagIcon,
  assign_conversation: UserCheck,
  update_contact_field: PencilLine,
  create_deal: Briefcase,
  wait: Hourglass,
  condition: GitBranch,
  send_webhook: Webhook,
  close_conversation: CircleSlash,
}

function summaryFor(step: BuilderStep): string {
  const cfg = step.step_config
  switch (step.step_type) {
    case "send_message":
      return ((cfg.text as string) || "").slice(0, 48) || "No text yet"
    case "send_buttons":
    case "send_list": {
      const body = cfg.body as { text?: string } | undefined
      return (body?.text ?? "").slice(0, 48) || "Interactive message"
    }
    case "send_template":
      return (cfg.template_name as string) || "Pick a template"
    case "add_tag":
    case "remove_tag":
      return (cfg.tag_id as string) ? `tag: ${cfg.tag_id as string}` : "Pick a tag"
    case "wait":
      return `${cfg.amount ?? "?"} ${cfg.unit ?? ""}`
    case "condition":
      return `When ${cfg.subject ?? "?"}`
    case "send_webhook":
      return ((cfg.url as string) || "").slice(0, 48) || "No URL"
    case "assign_conversation":
      return (cfg.mode as string) ?? "round_robin"
    case "update_contact_field":
      return `${cfg.field ?? "?"} to ${cfg.value ?? "?"}`
    case "create_deal":
      return (cfg.title as string) || "New deal"
    case "close_conversation":
      return "Closes conversation"
    default:
      return ""
  }
}

interface StepNodeData extends Record<string, unknown> {
  step: BuilderStep
  onSelectStep: (cid: string) => void
}

function AutomationStepNode({ data }: NodeProps) {
  const { step, onSelectStep } = data as StepNodeData
  const c = STEP_COLORS[step.step_type] ?? STEP_COLORS.send_message
  const label = STEP_LABELS[step.step_type] ?? step.step_type
  const Icon = STEP_ICONS[step.step_type] ?? Zap
  const summary = summaryFor(step)
  const isCondition = step.step_type === "condition"

  return (
    <div
      onClick={() => onSelectStep(step.cid)}
      style={{
        "--nc": c.solid,
        borderColor: "var(--border)",
        backgroundColor: "var(--card)",
        width: 220,
      } as React.CSSProperties}
      className="relative cursor-pointer select-none rounded-xl border shadow-[0_2px_8px_rgba(0,0,0,0.22)] transition-[box-shadow,border-color] hover:border-[var(--nc)] hover:shadow-[0_4px_18px_rgba(0,0,0,0.28)]"
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2.5 !w-2.5 !border-2 !bg-[var(--card)] !border-[var(--nc)]"
      />

      <div className="px-3 py-3">
        <NodeChip label={label} icon={<Icon />} color={c} />
        <div className="line-clamp-2 mt-1 text-[11px] leading-relaxed text-[var(--muted-foreground)]">
          {summary}
        </div>
        {isCondition && (
          <div className="mt-2.5 flex items-center justify-between border-t border-[var(--border)] pt-2">
            <span className="text-[10px] font-semibold text-emerald-400">YES ↙</span>
            <span className="text-[10px] font-semibold text-rose-400">NO ↘</span>
          </div>
        )}
      </div>

      {isCondition ? (
        <>
          <Handle
            type="source"
            id="yes"
            position={Position.Bottom}
            style={{ left: "30%" }}
            className="!h-2.5 !w-2.5 !border-2 !bg-[var(--card)] !border-emerald-500"
          />
          <Handle
            type="source"
            id="no"
            position={Position.Bottom}
            style={{ left: "70%" }}
            className="!h-2.5 !w-2.5 !border-2 !bg-[var(--card)] !border-rose-500"
          />
        </>
      ) : (
        <Handle
          type="source"
          id="default"
          position={Position.Bottom}
          className="!h-2.5 !w-2.5 !border-2 !bg-[var(--card)] !border-[var(--nc)]"
        />
      )}
    </div>
  )
}

const NODE_TYPES = { automationStep: AutomationStepNode }

const NODE_Y_STRIDE = 150
const BRANCH_X_OFFSET = 240
const BRANCH_Y_START = 140

interface LayoutResult {
  nodes: Node[]
  edges: Edge[]
}

function layoutSteps(
  steps: BuilderStep[],
  onSelectStep: (cid: string) => void,
  xBase: number,
  yBase: number,
  parentId: string | null,
  parentHandle: string | null,
  edgeLabel: string | null,
  edgeCounter: { n: number },
): LayoutResult {
  const nodes: Node[] = []
  const edges: Edge[] = []

  let lastId: string | null = parentId
  let lastHandle: string | null = parentHandle
  let lastLabel: string | null = edgeLabel
  let yPos = yBase

  for (const step of steps) {
    nodes.push({
      id: step.cid,
      type: "automationStep",
      position: { x: xBase, y: yPos },
      data: { step, onSelectStep } as StepNodeData,
    })

    if (lastId !== null) {
      const eid = `e_${edgeCounter.n++}`
      const isYes = lastLabel === "Yes"
      const isNo = lastLabel === "No"
      edges.push({
        id: eid,
        source: lastId,
        target: step.cid,
        sourceHandle: lastHandle ?? "default",
        label: lastLabel ?? undefined,
        labelStyle: { fill: "var(--muted-foreground)", fontSize: 10 },
        labelBgStyle: { fill: "var(--card)" },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 4,
        style: {
          stroke: isYes ? "oklch(0.7 0.18 145)" : isNo ? "oklch(0.65 0.2 25)" : "var(--border)",
          strokeWidth: isYes || isNo ? 2 : 1.5,
        },
      })
    }

    if (step.step_type === "condition" && step.branches) {
      const yBranch = yPos + BRANCH_Y_START
      const yesBranch = layoutSteps(step.branches.yes, onSelectStep, xBase - BRANCH_X_OFFSET, yBranch, step.cid, "yes", "Yes", edgeCounter)
      const noBranch  = layoutSteps(step.branches.no,  onSelectStep, xBase + BRANCH_X_OFFSET, yBranch, step.cid, "no",  "No",  edgeCounter)
      nodes.push(...yesBranch.nodes, ...noBranch.nodes)
      edges.push(...yesBranch.edges, ...noBranch.edges)

      const yesDepth = step.branches.yes.length > 0 ? yBranch + step.branches.yes.length * NODE_Y_STRIDE : yBranch
      const noDepth  = step.branches.no.length  > 0 ? yBranch + step.branches.no.length  * NODE_Y_STRIDE : yBranch
      yPos = Math.max(yesDepth, noDepth) + NODE_Y_STRIDE
      lastId = step.cid; lastHandle = "default"; lastLabel = null
    } else {
      yPos += NODE_Y_STRIDE
      lastId = step.cid; lastHandle = "default"; lastLabel = null
    }
  }

  return { nodes, edges }
}

function minimapNodeColor(node: Node): string {
  const data = node.data as StepNodeData | undefined
  if (!data?.step) return "var(--border)"
  return STEP_COLORS[data.step.step_type]?.solid ?? "var(--border)"
}

interface Props {
  steps: BuilderStep[]
  onSelectStep: (cid: string) => void
}

function AutomationCanvasInner({ steps, onSelectStep }: Props) {
  const { nodes, edges } = useMemo(() => {
    return layoutSteps(steps, onSelectStep, 0, 0, null, null, null, { n: 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps])

  if (nodes.length === 0) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-sm text-[var(--muted-foreground)]">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--muted)] opacity-60">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="5" rx="1" />
            <rect x="3" y="10" width="18" height="5" rx="1" />
            <rect x="3" y="17" width="18" height="4" rx="1" />
          </svg>
        </div>
        <p className="text-center leading-relaxed opacity-70">
          No steps yet.
          <br />
          Switch to <strong>List</strong> view to add steps.
        </p>
      </div>
    )
  }

  return (
    <div className="h-full w-full overflow-hidden">
      <CanvasWrapper
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        minimapNodeColor={minimapNodeColor}
      />
    </div>
  )
}

export function AutomationCanvas({ steps, onSelectStep }: Props) {
  return (
    <ReactFlowProvider>
      <AutomationCanvasInner steps={steps} onSelectStep={onSelectStep} />
    </ReactFlowProvider>
  )
}

