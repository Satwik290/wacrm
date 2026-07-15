"use client"

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  List,
  Play,
  RotateCcw,
  Send,
  Smartphone,
  Zap,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

import type { BuilderStep } from "../automation-builder"
import type { AutomationStepType } from "@/types"

type MessageSender = "bot" | "customer" | "system"
type MessageType =
  | "text"
  | "buttons"
  | "list"
  | "media"
  | "input_prompt"
  | "system_event"

interface SimMessage {
  id: string
  sender: MessageSender
  type: MessageType
  content: unknown
  timestamp: Date
}

interface SimulatorSession {
  history: SimMessage[]
  /** Path stack for nested branches. e.g. ["yes", 0] */
  cursor: number[]
  vars: Record<string, string>
  status: "idle" | "running" | "awaiting_input" | "ended"
}

const EMPTY_SESSION: SimulatorSession = {
  history: [],
  cursor: [0],
  vars: {},
  status: "idle",
}

function msgId(): string {
  return Math.random().toString(36).slice(2)
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback
}

export function AutomationSimulator({ steps }: { steps: BuilderStep[] }) {
  const [session, setSession] = useState<SimulatorSession>(EMPTY_SESSION)
  const [inputValue, setInputValue] = useState("")
  const [listOpen, setListOpen] = useState<string | null>(null)
  const [conditionNodeKey, setConditionNodeKey] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [session.history])

  // Get step at cursor path. If array is empty or index OOB, returns undefined.
  // The cursor array alternates [branchIndex, branchIndex, ...] for flat linear but
  // we actually just need a flattened array or recursive evaluator.
  // Actually, since we only need to step forward, it's easiest to flatten the tree
  // dynamically or manage a stack of `BuilderStep[]`.

  // Let's implement a step-resolver.
  // A cursor is a string like "0.yes.1.no.0" representing path in tree.
  const getStepByPath = (path: string): BuilderStep | undefined => {
    if (!path) return undefined
    const parts = path.split(".")
    let currentSteps = steps
    let currentStep: BuilderStep | undefined = undefined
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      if (part === "yes" || part === "no") {
        if (!currentStep || !currentStep.branches) return undefined
        currentSteps = currentStep.branches[part as "yes" | "no"]
      } else {
        const idx = parseInt(part, 10)
        currentStep = currentSteps[idx]
        if (!currentStep) return undefined
      }
    }
    return currentStep
  }

  const getNextPath = (path: string, branchChosen?: "yes" | "no"): string | null => {
    if (!path) return null
    const parts = path.split(".")
    
    if (branchChosen) {
      return `${path}.${branchChosen}.0`
    }

    // Increment last index
    const incrementLevel = (p: string[]): string | null => {
      if (p.length === 0) return null
      const last = p[p.length - 1]
      if (last === "yes" || last === "no") {
        // we finished this branch, pop up to parent and increment
        p.pop() // pop branch name
        p.pop() // pop parent index
        if (p.length === 0) return null
        return incrementLevel(p)
      } else {
        const nextIdx = parseInt(last, 10) + 1
        const prefix = p.slice(0, p.length - 1).join(".")
        const checkPath = prefix ? `${prefix}.${nextIdx}` : `${nextIdx}`
        if (getStepByPath(checkPath)) return checkPath
        
        // Out of bounds in current array. Pop up.
        if (p.length === 1) return null // Top level done
        
        const parentBranch = p[p.length - 2]
        const parentIdx = p[p.length - 3]
        const popped = p.slice(0, p.length - 2)
        return incrementLevel(popped)
      }
    }

    return incrementLevel([...parts])
  }

  const [currentPath, setCurrentPath] = useState<string | null>(null)

  const processNode = useCallback(
    (path: string, currentSession: SimulatorSession): SimulatorSession => {
      const step = getStepByPath(path)
      if (!step) {
        return {
          ...currentSession,
          status: "ended",
          history: [
            ...currentSession.history,
            {
              id: msgId(),
              sender: "system",
              type: "system_event",
              content: `Automation completed.`,
              timestamp: new Date(),
            },
          ],
        }
      }

      const cfg = step.step_config
      const type = step.step_type

      switch (type) {
        case "send_message": {
          const text = str(cfg.text, "(empty message)")
          const next = getNextPath(path)
          const updated: SimulatorSession = {
            ...currentSession,
            history: [
              ...currentSession.history,
              {
                id: msgId(),
                sender: "bot",
                type: "text",
                content: text,
                timestamp: new Date(),
              },
            ],
          }
          setCurrentPath(next)
          return next ? processNode(next, updated) : { ...updated, status: "ended" }
        }

        case "send_buttons": {
          const body = cfg.body as { text?: string } | undefined
          const next = getNextPath(path)
          const updated: SimulatorSession = {
            ...currentSession,
            history: [
              ...currentSession.history,
              {
                id: msgId(),
                sender: "bot",
                type: "buttons",
                content: {
                  text: body?.text || "(choose an option)",
                  buttons: ((cfg.action as Record<string, unknown>)?.buttons as unknown[]) || [],
                },
                timestamp: new Date(),
              },
            ],
          }
          setCurrentPath(next)
          return next ? processNode(next, updated) : { ...updated, status: "ended" }
        }

        case "send_list": {
          const body = cfg.body as { text?: string } | undefined
          const action = cfg.action as Record<string, unknown>
          const next = getNextPath(path)
          const updated: SimulatorSession = {
            ...currentSession,
            history: [
              ...currentSession.history,
              {
                id: msgId(),
                sender: "bot",
                type: "list",
                content: {
                  text: body?.text || "(choose from list)",
                  button_label: action?.button || "View options",
                  sections: action?.sections || [],
                },
                timestamp: new Date(),
              },
            ],
          }
          setCurrentPath(next)
          return next ? processNode(next, updated) : { ...updated, status: "ended" }
        }

        case "send_template": {
          const templateName = str(cfg.template_name, "(no template)")
          const next = getNextPath(path)
          const updated: SimulatorSession = {
            ...currentSession,
            history: [
              ...currentSession.history,
              {
                id: msgId(),
                sender: "bot",
                type: "text",
                content: `[Template: ${templateName}]`,
                timestamp: new Date(),
              },
            ],
          }
          setCurrentPath(next)
          return next ? processNode(next, updated) : { ...updated, status: "ended" }
        }

        case "condition": {
          setCurrentPath(path)
          return {
            ...currentSession,
            status: "awaiting_input",
            history: [
              ...currentSession.history,
              {
                id: msgId(),
                sender: "system",
                type: "system_event",
                content: `Condition node - pick branch`,
                timestamp: new Date(),
              },
            ],
          }
        }

        case "add_tag":
        case "remove_tag": {
          const tag = str(cfg.tag_id, "(no tag)").slice(0, 8)
          const next = getNextPath(path)
          const updated: SimulatorSession = {
            ...currentSession,
            history: [
              ...currentSession.history,
              {
                id: msgId(),
                sender: "system",
                type: "system_event",
                content: `${type === "remove_tag" ? "Removed" : "Added"} tag ${tag}...`,
                timestamp: new Date(),
              },
            ],
          }
          setCurrentPath(next)
          return next ? processNode(next, updated) : { ...updated, status: "ended" }
        }

        case "assign_conversation": {
          const next = getNextPath(path)
          const updated: SimulatorSession = {
            ...currentSession,
            history: [
              ...currentSession.history,
              {
                id: msgId(),
                sender: "system",
                type: "system_event",
                content: `Assigned conversation (${cfg.mode})`,
                timestamp: new Date(),
              },
            ],
          }
          setCurrentPath(next)
          return next ? processNode(next, updated) : { ...updated, status: "ended" }
        }

        case "update_contact_field": {
          const next = getNextPath(path)
          const updated: SimulatorSession = {
            ...currentSession,
            history: [
              ...currentSession.history,
              {
                id: msgId(),
                sender: "system",
                type: "system_event",
                content: `Updated field ${cfg.field} = ${cfg.value}`,
                timestamp: new Date(),
              },
            ],
          }
          setCurrentPath(next)
          return next ? processNode(next, updated) : { ...updated, status: "ended" }
        }

        case "create_deal": {
          const next = getNextPath(path)
          const updated: SimulatorSession = {
            ...currentSession,
            history: [
              ...currentSession.history,
              {
                id: msgId(),
                sender: "system",
                type: "system_event",
                content: `Created deal "${cfg.title}"`,
                timestamp: new Date(),
              },
            ],
          }
          setCurrentPath(next)
          return next ? processNode(next, updated) : { ...updated, status: "ended" }
        }

        case "wait": {
          const next = getNextPath(path)
          const updated: SimulatorSession = {
            ...currentSession,
            history: [
              ...currentSession.history,
              {
                id: msgId(),
                sender: "system",
                type: "system_event",
                content: `Wait ${cfg.amount} ${cfg.unit}`,
                timestamp: new Date(),
              },
            ],
          }
          setCurrentPath(next)
          return next ? processNode(next, updated) : { ...updated, status: "ended" }
        }

        case "send_webhook": {
          const next = getNextPath(path)
          const updated: SimulatorSession = {
            ...currentSession,
            history: [
              ...currentSession.history,
              {
                id: msgId(),
                sender: "system",
                type: "system_event",
                content: `Webhook sent to ${cfg.url}`,
                timestamp: new Date(),
              },
            ],
          }
          setCurrentPath(next)
          return next ? processNode(next, updated) : { ...updated, status: "ended" }
        }

        case "close_conversation": {
          const next = getNextPath(path)
          const updated: SimulatorSession = {
            ...currentSession,
            history: [
              ...currentSession.history,
              {
                id: msgId(),
                sender: "system",
                type: "system_event",
                content: `Conversation closed`,
                timestamp: new Date(),
              },
            ],
          }
          setCurrentPath(next)
          return next ? processNode(next, updated) : { ...updated, status: "ended" }
        }

        default: {
          const next = getNextPath(path)
          const updated: SimulatorSession = {
            ...currentSession,
            history: [
              ...currentSession.history,
              {
                id: msgId(),
                sender: "system",
                type: "system_event",
                content: `Unknown step "${type}" executed`,
                timestamp: new Date(),
              },
            ],
          }
          setCurrentPath(next)
          return next ? processNode(next, updated) : { ...updated, status: "ended" }
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [steps],
  )

  const handlePlay = useCallback(() => {
    if (steps.length === 0) {
      setSession((prev) => ({
        ...prev,
        status: "ended",
        history: [
          ...prev.history,
          {
            id: msgId(),
            sender: "system",
            type: "system_event",
            content: "No steps to simulate.",
            timestamp: new Date(),
          },
        ],
      }))
      return
    }
    
    setSession((prev) => {
      // Small artificial delay to make it feel more real if history exists
      const init: SimulatorSession = { ...prev, status: "running" }
      setCurrentPath("0")
      return processNode("0", init)
    })
  }, [steps, processNode])

  const handleTextSubmit = useCallback(() => {
    if (!inputValue.trim()) return
    
    const customerMsg: SimMessage = {
      id: msgId(),
      sender: "customer",
      type: "text",
      content: inputValue.trim(),
      timestamp: new Date(),
    }
    
    setSession((prev) => ({
      ...prev,
      history: [...prev.history, customerMsg],
    }))
    
    setInputValue("")
    
    // Automatically trigger the automation if it's idle
    if (session.status === "idle") {
      setTimeout(() => {
        handlePlay()
      }, 600)
    }
  }, [inputValue, session.status, handlePlay])

  const handleReset = useCallback(() => {
    setSession(EMPTY_SESSION)
    setInputValue("")
    setListOpen(null)
    setConditionNodeKey(null)
    setCurrentPath(null)
  }, [])

  const handleConditionBranch = useCallback(
    (branch: "yes" | "no") => {
      if (!currentPath) return
      const nextKey = getNextPath(currentPath, branch)
      
      const customerMsg: SimMessage = {
        id: msgId(),
        sender: "customer",
        type: "text",
        content: branch === "yes" ? "YES branch taken" : "NO branch taken",
        timestamp: new Date(),
      }
      const updated: SimulatorSession = {
        ...session,
        status: "running",
        history: [...session.history, customerMsg],
      }
      setCurrentPath(nextKey)
      setSession(nextKey ? processNode(nextKey, updated) : { ...updated, status: "ended" })
    },
    [currentPath, session, processNode],
  )

  const handleButtonTap = useCallback((title: string) => {
    const customerMsg: SimMessage = {
      id: msgId(),
      sender: "customer",
      type: "text",
      content: title,
      timestamp: new Date(),
    }
    setSession((prev) => ({
      ...prev,
      history: [...prev.history, customerMsg],
    }))
  }, [])

  const handleListRowTap = useCallback((title: string) => {
    const customerMsg: SimMessage = {
      id: msgId(),
      sender: "customer",
      type: "text",
      content: title,
      timestamp: new Date(),
    }
    setSession((prev) => ({
      ...prev,
      history: [...prev.history, customerMsg],
    }))
    setListOpen(null)
  }, [])

  return (
    <div className="flex h-full flex-col items-center justify-start overflow-hidden rounded-xl bg-[#0d1117] px-3 py-4">
      {/* Toolbar */}
      <div className="mb-3 flex w-full items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5 text-[#00a884]" />
          <span className="text-[11px] font-semibold tracking-wide text-[#aebac1]">
            SIMULATOR
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-[#8696a0] transition-colors hover:bg-white/10 hover:text-white"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
          <button
            type="button"
            onClick={handlePlay}
            disabled={session.status === "running" || session.status === "awaiting_input"}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors",
              session.status === "idle" || session.status === "ended"
                ? "bg-[#00a884] text-white hover:bg-[#00c99e]"
                : "cursor-not-allowed bg-[#00a884]/30 text-[#00a884]/60",
            )}
          >
            <Play className="h-3 w-3" />
            Play
          </button>
        </div>
      </div>

      {/* Phone frame */}
      <div
        className="relative flex flex-col overflow-hidden rounded-[2.2rem] shadow-2xl shadow-black/60"
        style={{
          width: 280,
          height: 560,
          background: "#111b21",
          border: "2px solid #2a3942",
          boxShadow: "0 0 0 6px #0d1117, 0 24px 48px rgba(0,0,0,0.7)",
          flexShrink: 0,
        }}
      >
        {/* Notch */}
        <div
          className="absolute left-1/2 top-2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black px-3 py-1"
          style={{ width: 80, height: 20 }}
        >
          <div className="h-1.5 w-1.5 rounded-full bg-[#2a3942]" />
          <div className="mx-auto h-1 w-8 rounded-full bg-[#2a3942]" />
          <div className="h-1.5 w-1.5 rounded-full bg-[#2a3942]" />
        </div>

        {/* Chat header */}
        <div className="flex items-center gap-2.5 bg-[#202c33] px-3 pb-2.5 pt-8">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#00a884]/20">
            <Zap className="h-4 w-4 text-[#00a884]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold text-white">
              Automation Engine
            </p>
            <p className="text-[10px] text-[#8696a0]">
              {session.status === "idle" && "Press Play to simulate"}
              {session.status === "running" && "running steps..."}
              {session.status === "awaiting_input" && "paused at condition"}
              {session.status === "ended" && "execution ended"}
            </p>
          </div>
          {session.status !== "idle" && (
            <Badge
              variant="secondary"
              className={cn(
                "shrink-0 px-1.5 py-0 text-[9px]",
                session.status === "ended"
                  ? "bg-[#2a3942] text-[#8696a0]"
                  : "bg-[#00a884]/20 text-[#00a884]",
              )}
            >
              {session.status}
            </Badge>
          )}
        </div>

        {/* Chat messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-2 py-2"
          style={{ background: "#111b21", scrollbarWidth: "none" }}
        >
          {session.history.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <Smartphone className="h-8 w-8 text-[#2a3942]" />
              <p className="text-[11px] text-[#2a3942]">
                Press Play to simulate automation
              </p>
            </div>
          )}

          {session.history.map((msg) => (
            <ChatMessage
              key={msg.id}
              msg={msg}
              onButtonTap={handleButtonTap}
              onListOpen={(key) => setListOpen(key)}
              listOpenKey={listOpen}
              onListRowTap={handleListRowTap}
            />
          ))}

          {/* Condition branch picker */}
          {session.status === "awaiting_input" && (
            <div className="my-2 flex flex-col items-center gap-1.5">
              <p className="text-[10px] text-[#8696a0]">Evaluate condition:</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleConditionBranch("yes")}
                  className="rounded-full border border-[#00a884] px-3 py-0.5 text-[11px] text-[#00a884] transition-colors hover:bg-[#00a884]/20"
                >
                  True (YES)
                </button>
                <button
                  type="button"
                  onClick={() => handleConditionBranch("no")}
                  className="rounded-full border border-[#ef4444] px-3 py-0.5 text-[11px] text-[#ef4444] transition-colors hover:bg-[#ef4444]/20"
                >
                  False (NO)
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Text input for simulating customer trigger */}
        <div className="flex items-center gap-1.5 border-t border-[#2a3942] bg-[#202c33] px-2 py-2">
          <input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleTextSubmit()
            }}
            placeholder="Message business..."
            className="flex-1 rounded-full bg-[#2a3942] px-3 py-1.5 text-[12px] text-white placeholder:text-[#8696a0] focus:outline-none"
          />
          <button
            type="button"
            onClick={handleTextSubmit}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#00a884] transition-colors hover:bg-[#00c99e]"
          >
            <Send className="h-3.5 w-3.5 text-white" />
          </button>
        </div>

        {/* Bottom home indicator */}
        <div className="flex justify-center bg-[#111b21] pb-1.5 pt-1">
          <div className="h-1 w-14 rounded-full bg-[#2a3942]" />
        </div>
      </div>
    </div>
  )
}

interface ChatMessageProps {
  msg: SimMessage
  onButtonTap: (title: string, nextNodeKey: string) => void
  onListOpen: (nodeKey: string) => void
  listOpenKey: string | null
  onListRowTap: (title: string, nextNodeKey: string) => void
}

function ChatMessage({
  msg,
  onButtonTap,
}: ChatMessageProps) {
  if (msg.sender === "system") {
    return (
      <div className="my-1.5 flex justify-center">
        <span className="rounded-full bg-[#182229] px-2.5 py-0.5 text-[10px] text-[#8696a0]">
          {msg.content as string}
        </span>
      </div>
    )
  }

  const isBot = msg.sender === "bot"
  const bubbleBase = "max-w-[210px] rounded-xl px-3 py-2 text-[12px] leading-relaxed shadow-sm"
  const botBubble = cn(bubbleBase, "bg-[#202c33] text-white rounded-tl-none")
  const customerBubble = cn(bubbleBase, "bg-[#005c4b] text-white rounded-tr-none ml-auto")

  return (
    <div className={cn("mb-2 flex flex-col", isBot ? "items-start" : "items-end")}>
      {(msg.type === "text" || msg.type === "input_prompt") && (
        <div className={isBot ? botBubble : customerBubble}>
          {msg.content as string}
          <span className="ml-1.5 text-[9px] opacity-50">{fmtTime(msg.timestamp)}</span>
        </div>
      )}
      
      {msg.type === "buttons" && (
        <>
          <div className={botBubble}>
            {(msg.content as { text: string }).text}
            <span className="ml-1.5 text-[9px] opacity-50">{fmtTime(msg.timestamp)}</span>
          </div>
          <div className="mt-1 flex flex-col gap-1">
            {(
              msg.content as {
                buttons: Array<{ reply_id: string; title: string; next_node_key: string }>
              }
            ).buttons?.map((btn, idx) => (
              <button
                key={btn.reply_id || idx}
                type="button"
                onClick={() => onButtonTap(btn.title || btn.reply_id || "", btn.next_node_key || "")}
                className="rounded-full border border-[#00a884]/60 bg-[#202c33] px-4 py-1 text-[11px] text-[#00a884] transition-colors hover:bg-[#00a884]/20 active:scale-95"
              >
                {btn.title || btn.reply_id}
              </button>
            ))}
          </div>
        </>
      )}

      {msg.type === "list" && (
        <div className={botBubble}>
          {(msg.content as { text: string }).text}
          <div className="mt-2 flex w-full justify-center border-t border-[#00a884]/30 pt-1.5">
            <button
              type="button"
              className="flex items-center gap-1 text-[11px] font-semibold text-[#00a884]"
            >
              <List className="h-3.5 w-3.5" />
              {(msg.content as { button_label: string }).button_label}
            </button>
          </div>
          <span className="mt-1 block text-right text-[9px] opacity-50">{fmtTime(msg.timestamp)}</span>
        </div>
      )}
    </div>
  )
}
