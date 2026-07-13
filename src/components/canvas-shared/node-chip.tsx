import type { ReactNode } from "react"

export interface NodeChipProps {
  label: string
  icon: ReactNode
  color: {
    solid: string
    soft: string
    text: string
  }
}

export function NodeChip({ label, icon, color }: NodeChipProps) {
  return (
    <div
      className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-transparent px-2 py-0.5"
      style={{
        backgroundColor: color.soft,
        color: color.text,
      }}
    >
      <div className="flex h-3 w-3 items-center justify-center [&>svg]:h-3 [&>svg]:w-3">
        {icon}
      </div>
      <span className="text-[10px] font-semibold uppercase tracking-widest leading-none">
        {label}
      </span>
    </div>
  )
}
